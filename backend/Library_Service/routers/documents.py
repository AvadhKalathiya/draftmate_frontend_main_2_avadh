"""
Library Document Upload Router

Handles file uploads for case documents. Files are saved to EFS
(SHARED_STORAGE_PATH/library_docs/{user_id}/{case_id}/) and served
via a dedicated endpoint.

Strategy:
  1. Try S3 upload first (if bucket + credentials configured)
  2. Fall back to EFS shared_drafts/library_docs/ (persistent across restarts)
"""

from __future__ import annotations

import logging
import mimetypes
import os
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/library", tags=["documents"])

# ── Config ─────────────────────────────────────────────────────────────────────
SHARED_STORAGE = os.getenv("SHARED_STORAGE_PATH", "/app/shared_drafts")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt", ".jpg", ".jpeg", ".png"}


def _get_upload_dir(user_id: str, case_id: str) -> Path:
    """Returns persistent EFS directory for library docs."""
    path = Path(SHARED_STORAGE) / "library_docs" / user_id / case_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _try_s3_upload(local_path: str, s3_key: str, content_type: str) -> str | None:
    """Attempt S3 upload. Returns S3 URL on success, None on failure."""
    bucket = os.getenv("S3_BUCKET_NAME", "")
    region = os.getenv("AWS_REGION", "ap-south-1")
    if not bucket or not os.getenv("AWS_ACCESS_KEY_ID"):
        return None
    try:
        import boto3
        s3 = boto3.client("s3", region_name=region)
        s3.upload_file(local_path, bucket, s3_key, ExtraArgs={"ContentType": content_type})
        url = f"https://{bucket}.s3.{region}.amazonaws.com/{s3_key}"
        logger.info(f"[LibraryDocs] Uploaded to S3: {url}")
        return url
    except Exception as e:
        logger.warning(f"[LibraryDocs] S3 upload failed, using EFS: {e}")
        return None


# ── Upload Endpoint ─────────────────────────────────────────────────────────────
@router.post("/cases/{case_id}/documents/upload")
async def upload_case_document(
    case_id: str,
    file: UploadFile = File(...),
    user_id: str = Form(...),
    folder_id: str = Form(default=""),
):
    """
    Upload a document for a case. Saves to S3 (if configured) or EFS fallback.
    Returns a permanent URL that will work across ECS restarts.
    """
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50 MB.")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    filename = file.filename or f"document-{uuid.uuid4()}"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Generate unique filename to avoid collisions
    unique_name = f"{uuid.uuid4()}_{filename}"
    content_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    # Save to EFS first (always — ensures local copy exists)
    upload_dir = _get_upload_dir(user_id, case_id)
    local_path = upload_dir / unique_name
    local_path.write_bytes(contents)

    # Try S3 — if succeeds, use S3 URL; otherwise use EFS API endpoint
    s3_key = f"library-docs/{user_id}/{case_id}/{unique_name}"
    s3_url = _try_s3_upload(str(local_path), s3_key, content_type)

    if s3_url:
        file_url = s3_url
    else:
        # Serve from EFS via our API endpoint
        file_url = f"/api/v1/library/cases/{case_id}/documents/files/{unique_name}?user_id={user_id}"

    return {
        "success": True,
        "filename": filename,
        "unique_name": unique_name,
        "url": file_url,
        "s3_key": s3_key if s3_url else None,
        "storage": "s3" if s3_url else "efs",
        "size_bytes": len(contents),
        "content_type": content_type,
    }


# ── File Serving Endpoint ───────────────────────────────────────────────────────
@router.get("/cases/{case_id}/documents/files/{filename}")
def serve_case_document(case_id: str, filename: str, user_id: str):
    """
    Serve a case document stored on EFS.
    Used as fallback when S3 is not available.
    """
    # Security: prevent path traversal
    safe_filename = Path(filename).name
    if safe_filename != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = Path(SHARED_STORAGE) / "library_docs" / user_id / case_id / safe_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    content_type = mimetypes.guess_type(safe_filename)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{safe_filename}"'},
    )


# ── Delete Document File ────────────────────────────────────────────────────────
@router.delete("/cases/{case_id}/documents/files/{filename}")
def delete_case_document(case_id: str, filename: str, user_id: str):
    """Delete a case document from EFS (and optionally S3)."""
    safe_filename = Path(filename).name
    file_path = Path(SHARED_STORAGE) / "library_docs" / user_id / case_id / safe_filename

    deleted_efs = False
    if file_path.exists():
        file_path.unlink()
        deleted_efs = True

    # Also try S3 delete
    deleted_s3 = False
    bucket = os.getenv("S3_BUCKET_NAME", "")
    if bucket and os.getenv("AWS_ACCESS_KEY_ID"):
        try:
            import boto3
            s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))
            s3_key = f"library-docs/{user_id}/{case_id}/{safe_filename}"
            s3.delete_object(Bucket=bucket, Key=s3_key)
            deleted_s3 = True
        except Exception as e:
            logger.warning(f"[LibraryDocs] S3 delete failed: {e}")

    if not deleted_efs and not deleted_s3:
        raise HTTPException(status_code=404, detail="Document not found.")

    return {"success": True, "deleted_efs": deleted_efs, "deleted_s3": deleted_s3}
