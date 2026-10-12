import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import fullLogo from "../assets/FULL_LOGO.svg";
import { API_CONFIG } from "../services/endpoints";
import "./Onboarding.css";

const CADetails = () => {
  const navigate = useNavigate();
  const [membershipNo, setMembershipNo] = useState("");
  const [profession, setProfession] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const professions = ["Chartered Accountant (CA)", "Company Secretary (CS)", "Cost Accountant (CMA)", "Compliance Officer"];
  const specializations = ["Tax Advisory", "Audit", "Compliance", "Corporate Law", "GST", "International Tax"];

  const handleSubmit = async () => {
    if (!profession) return toast.error("Please select your profession");
    if (!membershipNo.trim()) return toast.error("Please enter your membership number");
    if (!specialization) return toast.error("Please select specialization");

    setIsLoading(true);
    const userProfile = JSON.parse(localStorage.getItem("user_profile") || "{}");
    userProfile.profession = profession;
    userProfile.membership_no = membershipNo;
    userProfile.specialization = specialization;
    userProfile.role = profession || "CA / CS / Compliance";
    userProfile.onboarding_completed = "yes";
    localStorage.setItem("user_profile", JSON.stringify(userProfile));
    localStorage.setItem("draftmate_onboarded", "true");

    try {
      const userId = userProfile.id || userProfile.user_id || localStorage.getItem("user_id");
      if (userId) {
        fetch(`${API_CONFIG.AUTH.BASE_URL}/profile/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            role: profession || "CA / CS / Compliance",
            workplace: specialization || "Audit & Compliance",
            bio: membershipNo ? `Membership: ${membershipNo}` : ""
          })
        }).catch(() => {});
      }
    } catch (e) {}

    window.dispatchEvent(new Event("draftmate_consent_updated"));

    await new Promise((res) => setTimeout(res, 500));
    toast.success("Profile saved!");
    navigate("/dashboard/home");
  };

  return (
    <div className="onboarding-container">
      <header className="onboarding-header anim-fade-down">
        <a href="/" className="onboarding-logo">
          <img src={fullLogo} alt="DraftMate" className="logo-image" />
        </a>
      </header>

      <main className="onboarding-content">
        <div className="details-card anim-fade-up">
          <h1 className="details-title">📊 Welcome, Professional!</h1>
          <p className="details-subtitle">
            Help us understand your <strong>professional background</strong>.
          </p>

          <div className="form-group">
            <label className="form-label">Your Profession</label>
            <div className="options-list">
              {professions.map((p) => (
                <button
                  key={p}
                  className={`option-radio ${profession === p ? "active" : ""}`}
                  onClick={() => setProfession(p)}
                >
                  <span className="radio-circle">
                    {profession === p && <span className="radio-dot" />}
                  </span>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Membership / Registration Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., ICAI Membership No. 123456"
              value={membershipNo}
              onChange={(e) => setMembershipNo(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Area of Specialization</label>
            <div className="options-grid">
              {specializations.map((s) => (
                <button
                  key={s}
                  className={`option-pill ${specialization === s ? "active" : ""}`}
                  onClick={() => setSpecialization(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            className="continue-btn full-width-btn"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Continue to Dashboard →"}
          </button>
        </div>
      </main>
    </div>
  );
};

export default CADetails;
