import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import fullLogo from '../assets/FULL_LOGO.svg';
import { API_CONFIG } from '../services/endpoints';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showOtpInput, setShowOtpInput] = useState(false);

    const [isGoogleUser, setIsGoogleUser] = useState(false);
    const [otpHint, setOtpHint] = useState('');

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = `${API_CONFIG.AUTH.BASE_URL}${API_CONFIG.AUTH.ENDPOINTS.FORGOT_PASSWORD}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const text = await response.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    if (text.includes("<html") || response.status === 502 || response.status === 503) {
                        data = { detail: "Authentication server is temporarily restarting. Please retry in a few moments." };
                    } else {
                        data = { detail: text.replace(/<[^>]*>?/gm, '').trim() };
                    }
                }
            }

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to send OTP code');
            }

            if (data.dev_otp) {
                setOtp(data.dev_otp);
                setOtpHint(data.dev_otp);
                toast.success(`Verification code: ${data.dev_otp}`, { duration: 8000 });
            } else {
                setOtp('');
                toast.success("Verification code sent to your email.");
            }

            if (data.is_google_user) {
                setIsGoogleUser(true);
            }

            setShowOtpInput(true);

        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = `${API_CONFIG.AUTH.BASE_URL}${API_CONFIG.AUTH.ENDPOINTS.VERIFY_OTP}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
            });

            const text = await response.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    data = { detail: text.includes("<html") ? "Server is restarting, please retry." : text };
                }
            }

            if (!response.ok) {
                throw new Error(data.detail || 'Invalid or expired code.');
            }

            toast.success("Code verified successfully!");
            // Redirect to reset password with the token
            navigate(`/reset-password?token=${data.token}`);

        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-900 font-sans antialiased text-slate-900 dark:text-white h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-300">

            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl"></div>
            </div>

            <div className="max-w-md w-full mx-4 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 z-10 relative">
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <Link to="/">
                        <img src={fullLogo} alt="DraftMate" className="h-10 object-contain" />
                    </Link>
                </div>

                {!showOtpInput ? (
                    <>
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 mb-2">
                                Forgot Password?
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Enter your email and we'll send you an OTP code to reset your password.
                            </p>
                        </div>

                        <form onSubmit={handleSendOtp} className="space-y-6">
                            <label className="flex flex-col gap-2 group">
                                <span className="text-slate-900 dark:text-white text-sm font-medium">Email Address</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 h-12 px-4 placeholder:text-slate-400 text-base transition-all"
                                    placeholder="name@example.com"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </label>

                            <button
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-lg font-bold text-base transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Sending Code...
                                    </>
                                ) : (
                                    'Send Verification Code'
                                )}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 mb-2">
                                Enter Code
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                We've sent a 6-digit verification code to <span className="font-semibold">{email}</span>.
                            </p>
                        </div>

                        {isGoogleUser && (
                            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 text-xs sm:text-sm">
                                <p className="font-bold text-blue-900 dark:text-blue-100">💡 Google-Linked Account</p>
                                <p className="mt-1 text-blue-800 dark:text-blue-300 leading-relaxed text-xs">
                                    This account is registered via Google. You can sign in directly using Google without needing to reset a password.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className="mt-2.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs shadow-sm transition-all cursor-pointer"
                                >
                                    Go to Google Sign-In →
                                </button>
                            </div>
                        )}

                        {otpHint && (
                            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
                                <span>Verification Code: <strong className="text-sm font-mono tracking-wider">{otpHint}</strong></span>
                                <button
                                    type="button"
                                    onClick={() => setOtp(otpHint)}
                                    className="text-emerald-700 underline font-semibold cursor-pointer"
                                >
                                    Auto-fill
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleVerifyOtp} className="space-y-6">
                            <label className="flex flex-col gap-2 group">
                                <span className="text-slate-900 dark:text-white text-sm font-medium">6-Digit Code</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 h-12 px-4 placeholder:text-slate-400 text-center tracking-[0.5em] text-xl font-bold transition-all"
                                    placeholder="000000"
                                    type="text"
                                    maxLength="6"
                                    required
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                />
                            </label>

                            <button
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-lg font-bold text-base transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify Code'
                                )}
                            </button>
                        </form>

                        <button
                            onClick={() => setShowOtpInput(false)}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline mt-6 block w-full text-center"
                        >
                            Try a different email
                        </button>
                    </>
                )}

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
                    <Link to="/login" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-lg mr-1">arrow_back</span>
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
