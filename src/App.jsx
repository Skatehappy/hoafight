import { useState, useEffect } from "react";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY";

const APP = {
  name: "FightMyHOA",
  tagline: "HOA Appeal Letter Writer",
  icon: "⚔️",
  color: "#1a3d6b",
  colorLight: "#2a5da0",
  payhip: "https://payhip.com/b/8TWrB",
  support: "support@hoafight.com",
  price: "$49",
  font: "'Source Serif 4', Georgia, serif",
  displayFont: "'Playfair Display', serif",
};

const STEPS = ["Intro", "Owner", "HOA", "Dispute", "Demand", "Generate", "Letter"];
const FORM_STEPS = ["Owner", "HOA", "Dispute", "Demand"];

const colors = {
  paper: "#f8faf8",
  paperWarm: "#f0f5f0",
  paperDark: "#e0ece0",
  white: "#ffffff",
  ink: "#0f1a0f",
  inkLight: "#2a3d2a",
  inkMuted: "#5a7a5a",
  inkFaint: "#8aaa8a",
  gold: APP.color,
  goldLight: APP.colorLight,
  border: "#b0ccb0",
  borderLight: "#d0e8d0",
  green: "#1a5c2a",
  red: "#8b1a1a",
  errorBg: "#fff0f0",
  errorBorder: "#ffcccc",
  errorText: "#cc2222",
};

const stepFields = {
  Owner: [
    { key: "ownerName",    label: "Your Full Name",     type: "text",   required: true,  placeholder: "Jane Smith" },
    { key: "ownerAddress", label: "Your Address",        type: "text",   required: true,  placeholder: "123 Oak Lane, Unit 4B" },
    { key: "ownerEmail",   label: "Your Email",          type: "text",   required: false, placeholder: "jane@email.com" },
    { key: "state",        label: "Your State",          type: "text",   required: true,  placeholder: "Florida" },
  ],
  HOA: [
    { key: "hoaName",      label: "HOA / Association Name", type: "text",   required: true,  placeholder: "e.g. Sunset Ridge Homeowners Association" },
    { key: "hoaAddress",   label: "HOA Mailing Address",    type: "text",   required: false, placeholder: "e.g. 456 Main St, Suite 200" },
    { key: "fineAmount",   label: "Fine Amount",            type: "text",   required: false, placeholder: "e.g. $150" },
    { key: "noticeDate",   label: "Date of Notice / Violation Letter", type: "text", required: false, placeholder: "e.g. March 15, 2026" },
  ],
  Dispute: [
    { key: "disputeType",  label: "Type of Dispute",        type: "select", required: true,
      options: ["Wrongful Fine", "Architectural Denial", "Inconsistent Enforcement", "Records Denied", "Other"] },
    { key: "ccrSection",   label: "CC&R / Bylaw Section Referenced", type: "text", required: false, placeholder: "e.g. Article IV, Section 3.2" },
    { key: "disputeDetails", label: "Describe the Dispute",  type: "textarea", required: true,
      placeholder: "e.g. I received a $150 fine for my trash can being visible from the street on March 10. However, I had placed it out for scheduled pickup and it was removed within 2 hours. Multiple neighbors leave cans out longer without penalty." },
    { key: "evidence",     label: "Evidence You Have",       type: "textarea", required: false,
      placeholder: "e.g. Photos with timestamps, neighbor statements, prior board communications, meeting minutes showing selective enforcement" },
  ],
  Demand: [
    { key: "demand",         label: "What You Want",          type: "select", required: true,
      options: ["Fine rescinded in full", "Formal hearing before the board", "Architectural request approved", "Access to HOA records", "Written explanation of enforcement criteria", "Fine reduced and policy clarified"] },
    { key: "deadline",       label: "Response Deadline You're Setting", type: "text", required: false, placeholder: "e.g. 30 days from receipt of this letter" },
    { key: "nextSteps",      label: "What You'll Do If Ignored", type: "select", required: false,
      options: ["File complaint with state HOA regulator", "Request mediation or arbitration", "Consult an attorney", "File complaint and consult attorney", "All available remedies"] },
    { key: "additionalInfo", label: "Anything Else to Include", type: "textarea", required: false, placeholder: "Any other relevant details..." },
  ],
};

const requiredFields = {
  Owner: ["ownerName", "ownerAddress", "state"],
  HOA: ["hoaName"],
  Dispute: ["disputeType", "disputeDetails"],
  Demand: ["demand"],
};

const inputStyle = (focused) => ({
  width: "100%",
  padding: "13px 16px",
  background: colors.white,
  border: `1px solid ${focused ? colors.goldLight : colors.border}`,
  borderRadius: "8px",
  color: colors.ink,
  fontSize: "15px",
  fontFamily: APP.font,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
});

const btnStyle = (active) => ({
  background: active ? `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})` : colors.paperDark,
  border: "none",
  color: active ? "#fff" : colors.inkFaint,
  padding: "13px 28px",
  borderRadius: "6px",
  cursor: active ? "pointer" : "default",
  fontSize: "15px",
  fontWeight: active ? "700" : "400",
  fontFamily: APP.font,
  transition: "all 0.2s",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  boxShadow: active ? `0 2px 12px ${colors.goldLight}55` : "none",
});

function Field({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "4px" }}>
      <label style={{ display: "block", marginBottom: "7px", fontSize: "13px", color: colors.inkMuted }}>
        {field.label}
        {field.required && <span style={{ color: colors.goldLight, marginLeft: "4px" }}>*</span>}
      </label>
      {field.type === "select" ? (
        <select
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...inputStyle(focused), cursor: "pointer" }}
        >
          <option value="">Select...</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...inputStyle(focused), resize: "vertical", lineHeight: "1.7", minHeight: "112px" }}
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={inputStyle(focused)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: "16px", height: "16px",
      border: "2px solid rgba(255,255,255,0.3)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      display: "inline-block",
      animation: "spin 0.8s linear infinite"
    }} />
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [accessCode, setAccessCode] = useState("");
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [letter, setLetter] = useState("");
  const [altLetter, setAltLetter] = useState("");
  const [activeTab, setActiveTab] = useState("standard");
  const [checklist, setChecklist] = useState([]);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setAccessCode(code.toUpperCase());
      verifyCode(code.toUpperCase(), true);
    }
  }, []);

  useEffect(() => {
    try { const s = sessionStorage.getItem("hoa_form"); if (s) setFormData(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem("hoa_form", JSON.stringify(formData)); } catch {}
  }, [formData]);

  const handleChange = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const isStepValid = (stepName) => {
    return (requiredFields[stepName] || []).every(k => formData[k] && formData[k].trim());
  };

  const verifyCode = async (code, silent = false) => {
    if (!code || !code.trim()) { setCodeError("Please enter your access code."); return; }
    setCodeError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code, systemPrompt: "Reply: VALID", userPrompt: "check" }),
      });
      if (res.status === 401) {
        if (!silent) setCodeError("Invalid access code. Check your Payhip receipt email.");
        setCodeValid(false);
      } else {
        setCodeValid(true);
        if (!silent) setStep(1);
      }
    } catch {
      if (!silent) setCodeError("Could not verify. Check your connection.");
    }
  };

  const callAPI = async (systemPrompt, userPrompt, reviewMode, draftLetter) => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode, systemPrompt, userPrompt, reviewMode: !!reviewMode, draftLetter: draftLetter || "" }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Generation failed"); }
    return (await res.json()).text;
  };

  const systemPrompt = "You are an expert HOA and community association attorney. Write compelling appeal letters citing your state HOA statute, invoking due process and hearing rights, and challenging procedural defects. 500-700 words. Format: formal appeal letter with [DATE] placeholder, via certified mail. Output ONLY the letter.";

  const buildPrompt = (tone) => {
    const base = `
HOMEOWNER: ${formData.ownerName}
ADDRESS: ${formData.ownerAddress}
STATE: ${formData.state}
HOA NAME: ${formData.hoaName}
HOA ADDRESS: ${formData.hoaAddress || "not provided"}
FINE AMOUNT: ${formData.fineAmount || "not specified"}
NOTICE DATE: ${formData.noticeDate || "not provided"}
DISPUTE TYPE: ${formData.disputeType}
CC&R SECTION: ${formData.ccrSection || "not specified"}
DISPUTE DETAILS: ${formData.disputeDetails}
EVIDENCE: ${formData.evidence || "none provided"}
DEMAND: ${formData.demand}
RESPONSE DEADLINE: ${formData.deadline || "30 days"}
NEXT STEPS IF IGNORED: ${formData.nextSteps || "all available remedies"}
ADDITIONAL INFO: ${formData.additionalInfo || "none"}`;

    if (tone === "assertive") {
      return `Write a MORE ASSERTIVE appeal letter. Stronger language, explicit due process violations, more forceful demands. Different wording from standard:\n${base}`;
    }
    return `Write a STANDARD PROFESSIONAL appeal letter:\n${base}`;
  };

  const generateLetter = async () => {
    setLoading(true);
    setError("");
    setLetter("");
    setAltLetter("");
    setChecklist([]);
    try {
      setLoadingMsg("Drafting your appeal letter...");
      const draft = await callAPI(systemPrompt, buildPrompt("standard"), false, "");
      setLoadingMsg("Running quality review...");
      const reviewed = await callAPI("", "", true, draft);
      setLetter(reviewed);
      setLoadingMsg("Generating assertive version...");
      const alt = await callAPI(systemPrompt, buildPrompt("assertive"), false, "");
      setAltLetter(alt);
      setLoadingMsg("Building checklist...");
      try {
        const clRes = await fetch("/api/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessCode,
            address: formData.hoaName,
            state: formData.state,
            varianceType: "HOA appeal",
            letterExcerpt: reviewed.substring(0, 300),
          }),
        });
        if (clRes.ok) {
          const d = await clRes.json();
          setChecklist(d.checklist || []);
        }
      } catch {}
      setStep(STEPS.indexOf("Letter"));
      setRetryCount(0);
    } catch (e) {
      const n = retryCount + 1;
      setRetryCount(n);
      setError(`Generation failed: ${e.message}. Please try again.`);
    }
    setLoading(false);
    setLoadingMsg("");
  };

  const sendEmail = async () => {
    if (!email || !email.includes("@")) return;
    setEmailSending(true);
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        to_name: formData.ownerName,
        insurer: formData.hoaName,
        letter_standard: letter,
        letter_assertive: altLetter,
        from_name: APP.name,
        reply_to: APP.support,
      }, EMAILJS_PUBLIC_KEY);
      setEmailSent(true);
    } catch {
      setError("Email send failed. Please copy the letter manually.");
    }
    setEmailSending(false);
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadPDF = (text) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 72;
    const usableWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const lineHeight = 14;
    doc.setFont("Times", "normal");
    doc.setFontSize(11);
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const fullText = text.replace(/\[DATE\]/g, today);
    const lines = doc.splitTextToSize(fullText, usableWidth);
    let y = margin;
    lines.forEach(line => {
      if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
    doc.save("FightMyHOA-appeal-letter.pdf");
  };

  const reset = () => {
    setStep(codeValid ? 1 : 0);
    setFormData({});
    setLetter("");
    setAltLetter("");
    setError("");
    setEmailSent(false);
    setChecklist([]);
    setRetryCount(0);
    try { sessionStorage.removeItem("hoa_form"); } catch {}
  };

  const currentStep = STEPS[step];

  return (
    <div style={{ minHeight: "100vh", background: colors.paper, fontFamily: APP.font, color: colors.ink }}>

      {/* NAV */}
      <div style={{ background: colors.white, borderBottom: `1px solid ${colors.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "34px", height: "34px", background: `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})`, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
            {APP.icon}
          </div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", fontFamily: APP.displayFont, color: colors.ink }}>{APP.name}</div>
            <div style={{ fontSize: "10px", color: colors.inkFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{APP.tagline}</div>
          </div>
        </div>
        {letter && (
          <button onClick={reset} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.inkMuted, padding: "7px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontFamily: APP.font }}>
            ← New Letter
          </button>
        )}
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* INTRO / ACCESS GATE */}
        {currentStep === "Intro" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "13px", color: colors.goldLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
              {APP.icon} {APP.name}
            </div>
            <h1 style={{ fontFamily: APP.displayFont, fontSize: "clamp(28px,5vw,44px)", color: colors.ink, marginBottom: "16px", fontWeight: "900" }}>
              Your HOA Isn't Always Right.
            </h1>
            <p style={{ fontSize: "17px", color: colors.inkMuted, maxWidth: "480px", margin: "0 auto 40px", lineHeight: "1.7" }}>
              AI-generated appeal letters for HOA fines, violation notices, and architectural denials. Attorney-quality. 5 minutes. {APP.price}.
            </p>
            <div style={{ maxWidth: "400px", margin: "0 auto", background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "14px", color: colors.inkLight, marginBottom: "16px", fontWeight: "600" }}>Enter Your Access Code</div>
              <input
                type="text"
                value={accessCode}
                onChange={e => { setAccessCode(e.target.value.toUpperCase()); setCodeError(""); }}
                placeholder="e.g. HOA-ABC123"
                style={{ ...inputStyle(false), textAlign: "center", fontSize: "18px", letterSpacing: "0.1em", marginBottom: "12px", fontWeight: "600" }}
              />
              {codeError && <div style={{ color: colors.errorText, fontSize: "13px", marginBottom: "12px" }}>{codeError}</div>}
              <button onClick={() => verifyCode(accessCode)} style={{ ...btnStyle(!!accessCode.trim()), width: "100%", justifyContent: "center", padding: "14px" }}>
                Unlock My Letter →
              </button>
              <div style={{ marginTop: "16px", fontSize: "12px", color: colors.inkFaint }}>
                Don't have a code?{" "}
                <a href={APP.payhip} style={{ color: colors.goldLight, textDecoration: "none" }}>Purchase for {APP.price} →</a>
              </div>
            </div>
          </div>
        )}

        {/* FORM STEPS */}
        {FORM_STEPS.includes(currentStep) && (
          <div>
            {/* Progress bar */}
            <div style={{ marginBottom: "36px" }}>
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                {FORM_STEPS.map((s, i) => {
                  const idx = FORM_STEPS.indexOf(currentStep);
                  return (
                    <div key={s} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i < idx ? colors.goldLight : i === idx ? colors.gold : colors.borderLight, transition: "background 0.3s" }} />
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {FORM_STEPS.map((s, i) => {
                  const idx = FORM_STEPS.indexOf(currentStep);
                  return (
                    <div key={s} style={{ fontSize: "10px", color: i <= idx ? colors.goldLight : colors.borderLight, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                      {s}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step title */}
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ fontFamily: APP.displayFont, fontSize: "26px", color: colors.ink, marginBottom: "6px", fontWeight: "700" }}>
                {currentStep === "Owner" && "About You"}
                {currentStep === "HOA" && "Your HOA"}
                {currentStep === "Dispute" && "The Dispute"}
                {currentStep === "Demand" && "Your Demand"}
              </h2>
              <p style={{ fontSize: "14px", color: colors.inkMuted, lineHeight: "1.6" }}>
                {currentStep === "Owner" && "Your contact information and address."}
                {currentStep === "HOA" && "The HOA or community association involved."}
                {currentStep === "Dispute" && "What happened and why they're wrong."}
                {currentStep === "Demand" && "What you want and what you'll do next."}
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {(stepFields[currentStep] || []).map(f => (
                <Field key={f.key} field={f} value={formData[f.key]} onChange={v => handleChange(f.key, v)} />
              ))}
            </div>

            {/* Nav buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "36px" }}>
              <button onClick={() => setStep(s => s - 1)} style={{ ...btnStyle(true), background: "transparent", border: `1px solid ${colors.border}`, color: colors.inkMuted, boxShadow: "none" }}>
                ← Back
              </button>
              <button onClick={() => setStep(s => s + 1)} disabled={!isStepValid(currentStep)} style={btnStyle(isStepValid(currentStep))}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* GENERATE */}
        {currentStep === "Generate" && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontFamily: APP.displayFont, fontSize: "30px", color: colors.ink, marginBottom: "12px" }}>Ready to Generate</h2>
            <p style={{ fontSize: "16px", color: colors.inkMuted, maxWidth: "480px", margin: "0 auto 36px", lineHeight: "1.7" }}>
              Enter your email to receive a copy, then click Generate. Two-pass AI quality review — about 20-30 seconds.
            </p>
            <div style={{ maxWidth: "420px", margin: "0 auto" }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...inputStyle(false), textAlign: "center", marginBottom: "16px", fontSize: "15px" }}
              />
              <button onClick={generateLetter} disabled={loading} style={{ ...btnStyle(!loading), width: "100%", justifyContent: "center", padding: "16px", fontSize: "17px" }}>
                {loading ? <><Spinner /> {loadingMsg || "Generating..."}</> : "Generate My Letter ✦"}
              </button>
              {error && (
                <div style={{ marginTop: "16px", padding: "13px 16px", background: colors.errorBg, border: `1px solid ${colors.errorBorder}`, borderRadius: "8px", color: colors.errorText, fontSize: "13px" }}>
                  {error}
                  <button onClick={generateLetter} style={{ marginLeft: "12px", background: "transparent", border: "none", color: colors.goldLight, cursor: "pointer", fontSize: "13px" }}>Try again →</button>
                </div>
              )}
              <div style={{ marginTop: "14px", fontSize: "12px", color: colors.inkFaint }}>Two-pass AI review · Standard + Assertive versions · Checklist included</div>
            </div>
            <button onClick={() => setStep(s => s - 1)} style={{ marginTop: "28px", background: "transparent", border: "none", color: colors.inkFaint, cursor: "pointer", fontSize: "13px", fontFamily: APP.font }}>
              ← Edit my answers
            </button>
          </div>
        )}

        {/* LETTER OUTPUT */}
        {currentStep === "Letter" && letter && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
              <div>
                <div style={{ fontFamily: APP.displayFont, fontSize: "24px", color: colors.gold, marginBottom: "4px" }}>Your Letter is Ready</div>
                <div style={{ fontSize: "13px", color: colors.inkFaint }}>Two-pass AI reviewed · Two versions · Checklist included</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => copyText(activeTab === "standard" ? letter : altLetter)} style={btnStyle(true)}>
                  {copied ? "✓ Copied!" : "Copy Letter"}
                </button>
                <button onClick={() => downloadPDF(activeTab === "standard" ? letter : altLetter)} style={{ ...btnStyle(true), background: "transparent", border: `1px solid ${colors.goldLight}`, color: colors.goldLight }}>
                  ⬇ PDF
                </button>
              </div>
            </div>

            {altLetter && (
              <div style={{ display: "flex", gap: "2px", background: colors.paperDark, padding: "4px", borderRadius: "8px", marginBottom: "6px" }}>
                {[["standard", "Standard / Professional"], ["assertive", "Assertive / Detailed"]].map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "none", cursor: "pointer", fontFamily: APP.font, fontSize: "13px", transition: "all 0.2s", background: activeTab === key ? `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})` : "transparent", color: activeTab === key ? "#fff" : colors.inkMuted, fontWeight: activeTab === key ? "600" : "400" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: "12px", color: colors.inkFaint, marginBottom: "16px" }}>
              {activeTab === "standard" ? "Measured, professional tone. Good for first appeal." : "Stronger framing. Better when initial request was ignored."}
            </div>

            <div style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "40px 48px", lineHeight: "1.9", fontSize: "14px", color: colors.inkLight, whiteSpace: "pre-wrap", fontFamily: APP.font, boxShadow: "0 4px 32px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
              {activeTab === "standard" ? letter : altLetter}
            </div>

            {email && !emailSent && (
              <div style={{ background: colors.paperWarm, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "18px 22px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                <div style={{ fontSize: "14px", color: colors.inkLight }}>Send a copy to <strong>{email}</strong></div>
                <button onClick={sendEmail} disabled={emailSending} style={{ ...btnStyle(!emailSending), padding: "9px 20px", fontSize: "13px" }}>
                  {emailSending ? <><Spinner /> Sending...</> : "Send Copy →"}
                </button>
              </div>
            )}

            {emailSent && (
              <div style={{ background: "#e8f5e8", border: "1px solid #b0d8b0", borderRadius: "8px", padding: "14px 20px", marginBottom: "20px", fontSize: "14px", color: colors.green }}>
                ✓ Letter emailed to {email}
              </div>
            )}

            {checklist.length > 0 && (
              <div style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "24px 28px", marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", color: colors.goldLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "16px" }}>Next Steps Checklist</div>
                {checklist.map((item, i) => (
                  <label key={i} style={{ display: "flex", gap: "12px", marginBottom: "10px", cursor: "pointer", alignItems: "flex-start" }}>
                    <input type="checkbox" style={{ marginTop: "3px", accentColor: colors.goldLight }} />
                    <span style={{ fontSize: "14px", color: colors.inkLight, lineHeight: "1.5" }}>{item}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ background: "#fdf8ff", border: "1px solid #d8c8e8", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "14px" }}>
                <span style={{ fontSize: "22px" }}>💡</span>
                <div>
                  <div style={{ fontSize: "13px", color: "#7050a0", fontWeight: "600", marginBottom: "6px" }}>Know your rights as a homeowner.</div>
                  <div style={{ fontSize: "12px", color: "#9070b0", lineHeight: "1.6" }}>
                    Most states require HOAs to follow specific procedures before fining homeowners. If they skipped a hearing or failed to provide proper notice, their fine may be unenforceable.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 18px", background: colors.paperWarm, borderRadius: "8px", border: `1px solid ${colors.borderLight}`, fontSize: "11px", color: colors.inkFaint, lineHeight: "1.7" }}>
              <strong>Legal Disclaimer:</strong> This letter is AI-generated and does not constitute legal advice. Review all content for accuracy before sending. For complex matters, consult a licensed attorney.
            </div>

            <div style={{ marginTop: "24px", textAlign: "center", padding: "20px", background: colors.white, borderRadius: "10px", border: `1px solid ${colors.borderLight}` }}>
              <div style={{ fontSize: "14px", color: colors.inkMuted, marginBottom: "6px" }}>Did your HOA back down?</div>
              <div style={{ fontSize: "12px", color: colors.inkFaint }}>Share your outcome → <span style={{ color: colors.goldLight }}>results@hoafight.com</span></div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        @media print { button { display: none !important; } body { background: #fff; } }
      `}</style>

      <footer style={{ textAlign: "center", padding: "16px", fontSize: "0.72rem", color: "#888", borderTop: "1px solid #e5e0d6", marginTop: "40px" }}>
        FightMyHOA v1.3 · © 2026 The Super Simple Software Company · support@buyappsonce.com
      </footer>
    </div>
  );
}
