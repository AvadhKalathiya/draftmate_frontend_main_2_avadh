"""
s3_helper.py — S3 upload/download utilities for Draftmate services.

Strategy:
  1. If S3 env vars are set → upload to real S3 bucket.
  2. If S3 fails or env vars missing → fallback to EFS (SHARED_STORAGE_PATH).

This means code that already calls upload_file_to_s3() keeps working
and automatically falls back to EFS without any code changes elsewhere.
"""

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
def _get_bucket() -> str:
    return (
        os.getenv("S3_BUCKET_NAME")
        or os.getenv("S3_BUCKET")
        or "draftmate-drafts-251200161381"
    )

def _get_region() -> str:
    return os.getenv("AWS_REGION", "ap-south-1")

def _get_shared_storage() -> Path:
    """Returns the EFS mount path used as fallback."""
    path = os.getenv("SHARED_STORAGE_PATH", "/app/shared_drafts")
    return Path(path)

def _s3_client():
    """Returns a boto3 S3 client, or None if credentials are missing."""
    access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    if not access_key or not secret_key:
        return None
    try:
        import boto3
        return boto3.client(
            "s3",
            region_name=_get_region(),
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
    except ImportError:
        logger.warning("[s3_helper] boto3 not installed — falling back to EFS.")
        return None


# ── EFS Fallback helpers ──────────────────────────────────────────────────────
def _efs_path_for_key(s3_key: str) -> Path:
    """Converts an S3 key to an EFS path inside shared_drafts."""
    shared = _get_shared_storage()
    efs_path = shared / "s3_mirror" / s3_key
    efs_path.parent.mkdir(parents=True, exist_ok=True)
    return efs_path


# ── Public API ────────────────────────────────────────────────────────────────
def upload_file_to_s3(local_path: str, s3_key: str) -> str:
    """
    Upload a file to S3.
    Falls back to EFS mirror if S3 is unavailable.

    Args:
        local_path: absolute path to the file on disk.
        s3_key:     destination key inside the S3 bucket.

    Returns:
        The S3 URL on success, or the EFS fallback path as a string.
    """
    bucket = _get_bucket()
    s3 = _s3_client()

    # ── Attempt real S3 upload ─────────────────────────────────────────────
    if s3:
        try:
            s3.upload_file(local_path, bucket, s3_key)
            url = f"https://{bucket}.s3.{_get_region()}.amazonaws.com/{s3_key}"
            logger.info(f"[s3_helper] Uploaded to S3: {url}")
            return url
        except Exception as exc:
            logger.warning(
                f"[s3_helper] S3 upload failed for {s3_key}: {exc}. "
                "Falling back to EFS mirror."
            )

    # ── EFS fallback ───────────────────────────────────────────────────────
    try:
        efs_dest = _efs_path_for_key(s3_key)
        if str(Path(local_path).resolve()) != str(efs_dest.resolve()):
            shutil.copy2(local_path, efs_dest)
        logger.info(f"[s3_helper] Saved to EFS fallback: {efs_dest}")
        return str(efs_dest)
    except Exception as efs_exc:
        logger.error(f"[s3_helper] EFS fallback also failed: {efs_exc}")
        raise


def ensure_file_exists_locally(s3_key: str, local_path: str) -> str:
    """
    Ensure a file is available at local_path.

    1. If local_path already exists → return immediately (EFS already has it).
    2. Try to download from S3 → save to local_path.
    3. Try EFS mirror as last resort.

    Args:
        s3_key:     S3 object key.
        local_path: where the file should end up locally.

    Returns:
        local_path (guaranteed to exist on success).

    Raises:
        FileNotFoundError if the file cannot be found anywhere.
    """
    dest = Path(local_path)

    # ── Already exists locally (EFS / container) ──────────────────────────
    if dest.exists():
        logger.debug(f"[s3_helper] File already local: {local_path}")
        return local_path

    dest.parent.mkdir(parents=True, exist_ok=True)

    # ── Try S3 download ────────────────────────────────────────────────────
    bucket = _get_bucket()
    s3 = _s3_client()
    if s3:
        try:
            s3.download_file(bucket, s3_key, local_path)
            logger.info(f"[s3_helper] Downloaded from S3: {s3_key} → {local_path}")
            return local_path
        except Exception as exc:
            logger.warning(
                f"[s3_helper] S3 download failed for {s3_key}: {exc}. "
                "Trying EFS mirror."
            )

    # ── Try EFS mirror ─────────────────────────────────────────────────────
    efs_source = _efs_path_for_key(s3_key)
    if efs_source.exists():
        shutil.copy2(efs_source, dest)
        logger.info(f"[s3_helper] Copied from EFS mirror: {efs_source}")
        return local_path

    raise FileNotFoundError(
        f"[s3_helper] File not found in S3 (key={s3_key}) "
        f"or EFS mirror ({efs_source})"
    )


def get_public_url(s3_key: str) -> str:
    """
    Returns the public URL for an S3 object,
    or a local API path for EFS fallback.
    """
    bucket = _get_bucket()
    region = _get_region()
    return f"https://{bucket}.s3.{region}.amazonaws.com/{s3_key}"
