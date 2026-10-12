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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)] border border-slate-100 overflow-hidden flex flex-col my-auto p-6 sm:p-8 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">
            Terms of Use and Privacy Policy
          </h2>
        </div>

        {/* Description Text */}
        <div className="space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
          <p>
            Before you start exploring DraftMate, we kindly ask you to review and agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">
              Privacy Policy
            </a>
            . These documents outline important information about your rights and responsibilities, as well as how we handle your personal data.
          </p>
          <p>
            By using our website, you acknowledge that you have read, understood, and agreed to these terms. Your continued use of our site constitutes acceptance of these policies. Thank you for your attention and cooperation.
          </p>
        </div>

        {/* Checkboxes */}
        <div className="space-y-3 pt-2">
          {/* Checkbox 1: Terms of Service */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shrink-0 accent-blue-600 cursor-pointer"
            />
            <span className="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-slate-800 hover:text-blue-600 underline"
              >
                Terms of Service
              </a>{' '}
              <span className="text-red-500 font-bold">*</span>
            </span>
          </label>

          {/* Checkbox 2: Privacy Policy */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shrink-0 accent-blue-600 cursor-pointer"
            />
            <span className="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">
              I agree to the{' '}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-slate-800 hover:text-blue-600 underline"
              >
                Privacy Policy
              </a>{' '}
              <span className="text-red-500 font-bold">*</span>
            </span>
          </label>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isFormValid || isSubmitting}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-sm font-semibold transition-all shadow-sm ${isFormValid
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.99] cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/60 shadow-none'
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
