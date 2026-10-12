import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_CONFIG } from '../services/endpoints';

const AiContentNoticeModal = ({ isOpen, onAccept }) => {
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isFormValid = agreeTerms && agreePrivacy;

  const handleConfirm = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    const consentVal = 'yes';
    try {
      const consentData = {
        accepted: true,
        ai_consent: consentVal,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };

      // 1. Save consent locally
      localStorage.setItem('draftmate_ai_consent_accepted', 'true');
      localStorage.setItem('draftmate_ai_consent_value', consentVal);
      localStorage.setItem('draftmate_ai_consent_details', JSON.stringify(consentData));

      try {
        const profile = JSON.parse(localStorage.getItem('user_profile') || '{}');
        profile.ai_consent = consentVal;
        localStorage.setItem('user_profile', JSON.stringify(profile));
      } catch (e) { }

      // 2. Persist in PostgreSQL users table via auth service
      const sessionId = localStorage.getItem('session_id') || localStorage.getItem('token');
      const userProfile = JSON.parse(localStorage.getItem('user_profile') || '{}');
      const userId = userProfile.id || userProfile.user_id || localStorage.getItem('user_id');

      if (sessionId || userId) {
        try {
          const consentUrl = `${API_CONFIG.AUTH.BASE_URL}/v2/user/consent`;
          await fetch(consentUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionId || ''}`
            },
            body: JSON.stringify({
              user_id: userId || null,
              consent: consentVal
            })
          });
        } catch (apiErr) {
          console.warn('Backend consent sync warning (saved locally):', apiErr);
        }
      }

      window.dispatchEvent(new Event('draftmate_consent_updated'));
      toast.success('Terms of Service & Privacy Policy Accepted.');
      if (onAccept) onAccept(consentData);
    } catch (err) {
      console.error('Error saving consent:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-[460px] rounded-3xl bg-white shadow-[0_25px_70px_rgba(15,23,42,0.28)] border border-slate-100 overflow-hidden flex flex-col my-auto p-7 sm:p-8 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
            Terms of Use and Privacy Policy
          </h2>
        </div>

        {/* Description Text */}
        <div className="space-y-3.5 text-[13.5px] sm:text-[14px] text-slate-700 leading-relaxed font-normal">
          <p>
            Before you start exploring DraftMate, we kindly ask you to review and agree to our Terms of Service and Privacy Policy. These documents outline important information about your rights and responsibilities, as well as how we handle your personal data. By using our website, you acknowledge that you have read, understood, and agreed to these terms. Your continued use of our site constitutes acceptance of these policies.
          </p>
          <p>
            Thank you for your attention and cooperation.
          </p>
        </div>

        {/* Checkboxes */}
        <div className="space-y-3 pt-1">
          {/* Checkbox 1: Terms of Service */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-[#147a94] focus:ring-2 focus:ring-[#147a94]/30 shrink-0 accent-[#147a94] cursor-pointer"
            />
            <span className="text-[14px] text-slate-800 font-medium group-hover:text-slate-950 transition-colors">
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-slate-800 hover:text-[#147a94] hover:underline"
              >
                Terms of Service
              </a>{' '}
              <span className="text-slate-800 font-medium">*</span>
            </span>
          </label>

          {/* Checkbox 2: Privacy Policy */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-[#147a94] focus:ring-2 focus:ring-[#147a94]/30 shrink-0 accent-[#147a94] cursor-pointer"
            />
            <span className="text-[14px] text-slate-800 font-medium group-hover:text-slate-950 transition-colors">
              I agree to the{' '}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-slate-800 hover:text-[#147a94] hover:underline"
              >
                Privacy Policy
              </a>{' '}
              <span className="text-slate-800 font-medium">*</span>
            </span>
          </label>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isFormValid || isSubmitting}
            className={`w-full flex items-center justify-center gap-2 rounded-full py-3.5 px-6 text-[15px] font-semibold transition-all shadow-md ${isFormValid
                ? 'bg-[#147a94] hover:bg-[#0f647b] text-white shadow-[#147a94]/25 active:scale-[0.99] cursor-pointer'
                : 'bg-[#147a94]/40 text-white/80 cursor-not-allowed border border-transparent shadow-none'
              }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Continue</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiContentNoticeModal;

