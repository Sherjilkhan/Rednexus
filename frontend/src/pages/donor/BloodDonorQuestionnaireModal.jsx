import { useState } from "react";
import { Group, Modal, Pill } from "../../components/ui";
import "../../styles.css";
const MEDICAL_CONDITIONS = [
  "Allergy",
  "Cancer",
  "Fainting attacks",
  "Heart disease",
  "Lung disease",
  "Asthma",
  "Kidney disease",
  "Mental illness",
  "Amoebiasis",
  "Cold / Cough",
  "Liver disease",
  "Fever",
  "Endocrine disease",
  "Diabetes",
  "Syphilis",
  "Gonorrhoea",
  "Skin disease",
  "High / Low BP",
  "Leprosy",
  "Epilepsy Disorder",
  "Tuberculosis",
  "G6PD Deficiency",
  "Polycythemia",
  "Thyroid Disorder",
  "Bleeding Disorder",
];

function calculateAge(dob) {
  if (!dob) return "";
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return isNaN(age) ? "" : age;
}

export default function BloodDonorQuestionnaireModal({
  notification,
  donorProfile,
  onClose,
  onSubmit,
  submitting,
  submitLabel,
  context = 'emergency', // 'emergency' | 'camp'
}) {
  const isFemale = donorProfile?.gender === "FEMALE";

  // Personal Information (Autofilled where available)
  const [personal, setPersonal] = useState({
    name: donorProfile?.name || "",
    gender: donorProfile?.gender || "MALE",
    date_of_birth: donorProfile?.date_of_birth || "",
    age: calculateAge(donorProfile?.date_of_birth),
    occupation: "",
    address: donorProfile?.area_pincode
      ? `Pincode: ${donorProfile.area_pincode}`
      : "",
    nationality: "Indian",
    contact_resi: "",
    contact_office: "",
    mobile: donorProfile?.contact_phone || donorProfile?.phone || "",
    email: donorProfile?.email || "",
    patient_name: "",
    donation_type: "Voluntary (Whole Blood)",
  });

  // Section 1: Previous Donations
  const [s1, setS1] = useState({
    donated_previously: donorProfile?.last_donation_date ? "YES" : "NO",
    donation_count: "",
    last_donation_date: donorProfile?.last_donation_date || "",
    had_discomfort_previously: "NO",
    discomfort_details: "",
    advised_not_to_donate: donorProfile?.advised_not_to_donate_flag
      ? "YES"
      : "NO",
  });

  // Section 2: Current Wellness
  const [s2, setS2] = useState({
    feeling_well_today: "YES",
    eaten_last_4_hours: "YES",
    heavy_work_or_driving_today: "NO",
  });

  // Section 3: Medical Conditions (25 items)
  const [conditions, setConditions] = useState([]);

  // Section 4: Past 12 Months
  const [s4, setS4] = useState({
    received_blood_12m: "NO",
    accidents_operations_12m: "NO",
    typhoid_12m: "NO",
    animal_bite_rabies_12m: "NO",
    tattoo_piercing_acupuncture_12m: "NO",
    imprisoned_12m: "NO",
  });

  // Section 5: Jaundice & Hepatitis (Past 1 Year)
  const [s5, setS5] = useState({
    jaundice_1y: "NO",
    hepatitis_tested_positive: "NO",
    hepatitis_contact_1y: "NO",
  });

  // Section 6: Malaria (Last 3 Months)
  const [malaria3m, setMalaria3m] = useState("NO");

  // Section 7: Dental / Chikungunya / Dengue (Last 6 Months)
  const [dentalOrInfection6m, setDentalOrInfection6m] = useState("NO");

  // Section 8: Antibiotics / Vaccines / Measles / Mumps / Chicken Pox (Last 2 Weeks)
  const [antibiotics2w, setAntibiotics2w] = useState("NO");

  // Section 9: Other Medications
  const [otherMedications, setOtherMedications] = useState("");

  // Section 10: Blood Safety Knowledge & High Risk
  const [s10, setS10] = useState({
    know_hiv_hepatitis_ineligible: "YES",
    know_multiple_partners_ineligible: "YES",
    know_sex_worker_ineligible: "YES",
    know_injected_drugs_ineligible: "YES",
    know_suspect_std_ineligible: "YES",
  });

  // Section 11: Risk Categories & Symptoms
  const [s11, setS11] = useState({
    aids_infection_belief: "NO",
    symptoms_last_6m: "NO", // Night sweats, fever, weight loss, swollen glands, diarrhea
  });

  // Section 12: Women Donors Only
  const [s12, setS12] = useState({
    pregnant_or_abortion_6m: "NO",
    child_under_1y_or_breastfeeding: "NO",
    periods_today: "NO",
  });

  // Section 13: Consent & Declarations
  const [consentAbnormalResults, setConsentAbnormalResults] = useState("YES");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [validationError, setValidationError] = useState("");

  const toggleCondition = (item) => {
    setConditions((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  };

  const handleYN = (setter, key, val) => {
    setter((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!consentConfirmed) {
      setValidationError(
        "Please review and check the statutory consent declaration at the bottom.",
      );
      return;
    }
    setValidationError("");

    const questionnaireData = {
      institution_name: notification?.institution_name || "Blood Bank",
      blood_group:
        notification?.blood_group ||
        donorProfile?.blood_group_verified ||
        donorProfile?.blood_group_self_reported,
      submitted_at: new Date().toISOString(),
      personal,
      previous_donations: s1,
      current_wellness: s2,
      medical_conditions: conditions,
      past_12_months: s4,
      hepatitis_and_jaundice: s5,
      malaria_last_3m: malaria3m,
      dental_chikungunya_dengue_6m: dentalOrInfection6m,
      antibiotics_vaccines_2w: antibiotics2w,
      other_medications: otherMedications,
      high_risk_awareness: s10,
      risk_categories_and_symptoms: s11,
      women_specific: isFemale ? s12 : null,
      consent: {
        voluntary_donation: true,
        plasma_fractionation: true,
        testing_authorized: true,
        inform_abnormal_results: consentAbnormalResults === "YES",
        donor_confirmed: true,
      },
    };

    onSubmit(questionnaireData);
  };

  return (
    <Modal
      title="Blood Donor Medical Questionnaire"
      onClose={onClose}
      size="lg"
      footer={
        <div
          className="row"
          style={{ width: "100%", justifyContent: "space-between" }}
        >
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="donor-questionnaire-form"
            className="btn-confirm btn-lg"
            disabled={submitting}
          >
            {submitting
              ? "Submitting & Confirming..."
              : (submitLabel || "Submit Questionnaire & Accept Request")}
          </button>
        </div>
      }
    >
      <form
        id="donor-questionnaire-form"
        onSubmit={handleSubmit}
        className="stack"
      >
        {/* Banner */}
        <div
          className="note note-blue"
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "5px",
          }}
        >
          <div>
            <strong style={{ maxWidth: "50%", textOverflow: "ellipsis" }}>
              {notification?.institution_name || "Blood Centre"}
            </strong>
            <div className="xs muted">
              Pre-Donation Medical History &amp; Consent Form
            </div>
          </div>
          <div className="row">
            <Group>{notification?.blood_group || "Blood Request"}</Group>
            <Pill tone="blue">Voluntary Donation</Pill>
          </div>
        </div>

        {/* Section 0: Personal Information */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            <span>Donor Information (Autofilled)</span>
          </div>
          <div className="grid grid-3">
            <label className="xs">
              <span className="muted">Full Name</span>
              <input
                type="text"
                value={personal.name}
                onChange={(e) =>
                  setPersonal({ ...personal, name: e.target.value })
                }
                required
              />
            </label>
            <label className="xs">
              <span className="muted">Gender</span>
              <select
                value={personal.gender}
                onChange={(e) =>
                  setPersonal({ ...personal, gender: e.target.value })
                }
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="xs">
              <span className="muted">Date of Birth &amp; Age</span>
              <div className="row" style={{ gap: 4 }}>
                <input
                  type="date"
                  value={personal.date_of_birth}
                  onChange={(e) => {
                    const dob = e.target.value;
                    setPersonal({
                      ...personal,
                      date_of_birth: dob,
                      age: calculateAge(dob),
                    });
                  }}
                  required
                />
                <input
                  type="text"
                  placeholder="Age"
                  style={{ width: 60 }}
                  value={personal.age ? `${personal.age} yrs` : ""}
                  readOnly
                />
              </div>
            </label>
            <label className="xs">
              <span className="muted">Mobile Phone</span>
              <input
                type="text"
                value={personal.mobile}
                onChange={(e) =>
                  setPersonal({ ...personal, mobile: e.target.value })
                }
                required
              />
            </label>
            <label className="xs">
              <span className="muted">Email</span>
              <input
                type="email"
                value={personal.email}
                onChange={(e) =>
                  setPersonal({ ...personal, email: e.target.value })
                }
                required
              />
            </label>
            <label className="xs">
              <span className="muted">Nationality</span>
              <input
                type="text"
                value={personal.nationality}
                onChange={(e) =>
                  setPersonal({ ...personal, nationality: e.target.value })
                }
              />
            </label>
            <label className="xs">
              <span className="muted">Occupation</span>
              <input
                type="text"
                placeholder="e.g. Engineer, Teacher"
                value={personal.occupation}
                onChange={(e) =>
                  setPersonal({ ...personal, occupation: e.target.value })
                }
              />
            </label>
            <label className="xs" style={{ gridColumn: "span 2" }}>
              <span className="muted">Residential Address / Area</span>
              <input
                type="text"
                value={personal.address}
                onChange={(e) =>
                  setPersonal({ ...personal, address: e.target.value })
                }
              />
            </label>
          </div>
        </div>

        {/* Section 1: Previous Donations */}
        <div className="form-section stack-sm">
          <div className="form-section-title">1. Previous Donations</div>
          <div className="q-row">
            <span className="q-label">
              1.0 Have you donated Blood previously?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s1.donated_previously === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS1, "donated_previously", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s1.donated_previously === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS1, "donated_previously", "NO")}
              >
                No
              </button>
            </div>
          </div>

          {s1.donated_previously === "YES" && (
            <div
              className="grid grid-2"
              style={{
                padding: "8px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <label className="xs">
                <span className="muted">1.1 If yes, how many times?</span>
                <input
                  type="text"
                  placeholder="e.g. 2 times"
                  value={s1.donation_count}
                  onChange={(e) =>
                    setS1({ ...s1, donation_count: e.target.value })
                  }
                />
              </label>
              <label className="xs">
                <span className="muted">1.2 Date of last donation</span>
                <input
                  type="date"
                  value={s1.last_donation_date}
                  onChange={(e) =>
                    setS1({ ...s1, last_donation_date: e.target.value })
                  }
                />
              </label>
            </div>
          )}

          <div className="q-row">
            <span className="q-label">
              1.3 Did you experience any ailment, difficulty or discomfort
              during previous donations?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s1.had_discomfort_previously === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS1, "had_discomfort_previously", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s1.had_discomfort_previously === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS1, "had_discomfort_previously", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          {s1.had_discomfort_previously === "YES" && (
            <label
              className="xs"
              style={{
                paddingBottom: 8,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span className="muted">1.4 What was the difficulty?</span>
              <input
                type="text"
                placeholder="Describe difficulty"
                value={s1.discomfort_details}
                onChange={(e) =>
                  setS1({ ...s1, discomfort_details: e.target.value })
                }
              />
            </label>
          )}

          <div className="q-row">
            <span className="q-label">
              1.5 Have you ever been advised not to donate blood?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s1.advised_not_to_donate === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS1, "advised_not_to_donate", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s1.advised_not_to_donate === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS1, "advised_not_to_donate", "NO")}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Current Wellness */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            2. Current Wellness &amp; Activity
          </div>
          <div className="q-row">
            <span className="q-label">2.0 Are you feeling well today?</span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s2.feeling_well_today === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS2, "feeling_well_today", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s2.feeling_well_today === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS2, "feeling_well_today", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              2.1 Have you eaten anything in the last 4 hours?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s2.eaten_last_4_hours === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS2, "eaten_last_4_hours", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s2.eaten_last_4_hours === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS2, "eaten_last_4_hours", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              2.2 After donating blood do you have to engage in heavy work,
              driving heavy vehicle or work at heights today?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s2.heavy_work_or_driving_today === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS2, "heavy_work_or_driving_today", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s2.heavy_work_or_driving_today === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS2, "heavy_work_or_driving_today", "NO")
                }
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Medical Conditions Checklist */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            3. Medical Conditions Checklist
          </div>
          <p className="xs muted" style={{ marginBottom: 4 }}>
            Have you had / have any of the following? If yes, click to select
            and discuss with the doctor present at the blood centre:
          </p>
          <div className="med-check-grid">
            {MEDICAL_CONDITIONS.map((cond) => {
              const isChecked = conditions.includes(cond);
              return (
                <div
                  key={cond}
                  className={`med-check-item ${isChecked ? "checked" : ""}`}
                  onClick={() => toggleCondition(cond)}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    style={{ margin: 0, width: "10%" }}
                  />
                  <span>{cond}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Past 12 Months History */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            4. During Past 12 Months Have You Had:
          </div>
          <div className="q-row">
            <span className="q-label">
              4.1 Received blood or blood components?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.received_blood_12m === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS4, "received_blood_12m", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.received_blood_12m === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS4, "received_blood_12m", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">4.2 Any accidents or operations?</span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.accidents_operations_12m === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS4, "accidents_operations_12m", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.accidents_operations_12m === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS4, "accidents_operations_12m", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">4.3 Have you had Typhoid?</span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.typhoid_12m === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS4, "typhoid_12m", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.typhoid_12m === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS4, "typhoid_12m", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              4.4 Bitten by any animal, which can result in rabies?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.animal_bite_rabies_12m === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS4, "animal_bite_rabies_12m", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.animal_bite_rabies_12m === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS4, "animal_bite_rabies_12m", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              4.5 Had tattooing / ear piercing or acupuncture treatment?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.tattoo_piercing_acupuncture_12m === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS4, "tattoo_piercing_acupuncture_12m", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.tattoo_piercing_acupuncture_12m === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS4, "tattoo_piercing_acupuncture_12m", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              4.6 Have you been imprisoned for any reason?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s4.imprisoned_12m === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS4, "imprisoned_12m", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s4.imprisoned_12m === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS4, "imprisoned_12m", "NO")}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 5: Hepatitis & Jaundice (Past 1 Year) */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            5. Jaundice &amp; Hepatitis History
          </div>
          <div className="q-row">
            <span className="q-label">
              5.0 Have you had jaundice in the last 1 year?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s5.jaundice_1y === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS5, "jaundice_1y", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s5.jaundice_1y === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS5, "jaundice_1y", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              5.1 Has your blood ever tested positive for Hepatitis B or C?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s5.hepatitis_tested_positive === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS5, "hepatitis_tested_positive", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s5.hepatitis_tested_positive === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS5, "hepatitis_tested_positive", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              5.2 Have you had close contact with anyone with Hepatitis B or C
              (family/others)?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s5.hepatitis_contact_1y === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS5, "hepatitis_contact_1y", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s5.hepatitis_contact_1y === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS5, "hepatitis_contact_1y", "NO")}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 6 - 9: Short Term History & Medications */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            6–9. Short-Term Health &amp; Medications
          </div>
          <div className="q-row">
            <span className="q-label">
              6. Have you had malaria or taken antimalarial drugs in the last 3
              months?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${malaria3m === "YES" ? "active-yes" : ""}`}
                onClick={() => setMalaria3m("YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${malaria3m === "NO" ? "active-no" : ""}`}
                onClick={() => setMalaria3m("NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              7. Have you had Dental Procedure, Chikungunya or Dengue in the
              last 6 months?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${dentalOrInfection6m === "YES" ? "active-yes" : ""}`}
                onClick={() => setDentalOrInfection6m("YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${dentalOrInfection6m === "NO" ? "active-no" : ""}`}
                onClick={() => setDentalOrInfection6m("NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              8. Have you taken any Antibiotic/Vaccination or suffered from
              Measles, Mumps or Chicken Pox in the past 2 weeks?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${antibiotics2w === "YES" ? "active-yes" : ""}`}
                onClick={() => setAntibiotics2w("YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${antibiotics2w === "NO" ? "active-no" : ""}`}
                onClick={() => setAntibiotics2w("NO")}
              >
                No
              </button>
            </div>
          </div>

          <label className="xs" style={{ marginTop: 8 }}>
            <span className="muted">
              9. History of any other ongoing medication (if any):
            </span>
            <textarea
              rows={2}
              placeholder="e.g. None or list medications..."
              value={otherMedications}
              onChange={(e) => setOtherMedications(e.target.value)}
            />
          </label>
        </div>

        {/* Section 10: Blood Safety Knowledge & Conditions */}
        <div className="form-section stack-sm">
          <div className="form-section-title">10. Blood Safety Knowledge</div>
          <p className="xs muted" style={{ marginBottom: 4 }}>
            Do you know that you should not give blood in the following
            conditions?
          </p>
          <div className="q-row">
            <span className="q-label">
              10.1 If you were found to be HIV positive, Hepatitis B, C or
              Syphilis infections
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s10.know_hiv_hepatitis_ineligible === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_hiv_hepatitis_ineligible", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s10.know_hiv_hepatitis_ineligible === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_hiv_hepatitis_ineligible", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              10.2 If you have multiple sex partners or have engaged in
              male-to-male sexual activity
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s10.know_multiple_partners_ineligible === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_multiple_partners_ineligible", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s10.know_multiple_partners_ineligible === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_multiple_partners_ineligible", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              10.3 If you have ever worked as a sex worker or had sex with a sex
              worker
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s10.know_sex_worker_ineligible === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_sex_worker_ineligible", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s10.know_sex_worker_ineligible === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_sex_worker_ineligible", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              10.4 If you have ever injected any drug (especially narcotics) not
              prescribed by a qualified doctor
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s10.know_injected_drugs_ineligible === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_injected_drugs_ineligible", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s10.know_injected_drugs_ineligible === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_injected_drugs_ineligible", "NO")
                }
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              10.5 If you suspect that you or your partner may have HIV or any
              other sexually transmitted disease
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s10.know_suspect_std_ineligible === "YES" ? "active-yes" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_suspect_std_ineligible", "YES")
                }
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s10.know_suspect_std_ineligible === "NO" ? "active-no" : ""}`}
                onClick={() =>
                  handleYN(setS10, "know_suspect_std_ineligible", "NO")
                }
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 11: Risk Categories & Symptoms */}
        <div className="form-section stack-sm">
          <div className="form-section-title">
            11. Risk Categories &amp; Symptoms
          </div>
          <div className="q-row">
            <span className="q-label">
              11.1 Do you or your sexual partner belong to any of the above
              categories, or have reason to believe you have been infected by
              the virus that causes AIDS?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s11.aids_infection_belief === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS11, "aids_infection_belief", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s11.aids_infection_belief === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS11, "aids_infection_belief", "NO")}
              >
                No
              </button>
            </div>
          </div>

          <div className="q-row">
            <span className="q-label">
              11.2 In the last 6 months have you had Night Sweats, Persistent
              Fever, Unexplained Weight Loss, Swollen Glands, or Persistent
              Diarrhoea?
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${s11.symptoms_last_6m === "YES" ? "active-yes" : ""}`}
                onClick={() => handleYN(setS11, "symptoms_last_6m", "YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${s11.symptoms_last_6m === "NO" ? "active-no" : ""}`}
                onClick={() => handleYN(setS11, "symptoms_last_6m", "NO")}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Section 12: Women Donors Only */}
        {isFemale && (
          <div className="form-section stack-sm">
            <div className="form-section-title">12. For Women Donors</div>
            <div className="q-row">
              <span className="q-label">
                12.1 Are you pregnant or have you had an abortion in the last 6
                months?
              </span>
              <div className="q-options">
                <button
                  type="button"
                  className={`btn-yn ${s12.pregnant_or_abortion_6m === "YES" ? "active-yes" : ""}`}
                  onClick={() =>
                    handleYN(setS12, "pregnant_or_abortion_6m", "YES")
                  }
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`btn-yn ${s12.pregnant_or_abortion_6m === "NO" ? "active-no" : ""}`}
                  onClick={() =>
                    handleYN(setS12, "pregnant_or_abortion_6m", "NO")
                  }
                >
                  No
                </button>
              </div>
            </div>

            <div className="q-row">
              <span className="q-label">
                12.2 Have you a child less than 1 year of age? Are you
                breastfeeding?
              </span>
              <div className="q-options">
                <button
                  type="button"
                  className={`btn-yn ${s12.child_under_1y_or_breastfeeding === "YES" ? "active-yes" : ""}`}
                  onClick={() =>
                    handleYN(setS12, "child_under_1y_or_breastfeeding", "YES")
                  }
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`btn-yn ${s12.child_under_1y_or_breastfeeding === "NO" ? "active-no" : ""}`}
                  onClick={() =>
                    handleYN(setS12, "child_under_1y_or_breastfeeding", "NO")
                  }
                >
                  No
                </button>
              </div>
            </div>

            <div className="q-row">
              <span className="q-label">
                12.3 Are you having your Periods today?
              </span>
              <div className="q-options">
                <button
                  type="button"
                  className={`btn-yn ${s12.periods_today === "YES" ? "active-yes" : ""}`}
                  onClick={() => handleYN(setS12, "periods_today", "YES")}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`btn-yn ${s12.periods_today === "NO" ? "active-no" : ""}`}
                  onClick={() => handleYN(setS12, "periods_today", "NO")}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 13: Consent & Declarations */}
        <div
          className="form-section stack-sm"
          style={{ background: "var(--surface-2)" }}
        >
          <div className="form-section-title">
            Consent &amp; Statutory Declaration
          </div>
          <div className="small muted stack-sm">
            <p>
              <strong>I understand that:</strong>
            </p>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              <li>
                Blood donation is a voluntary act and no inducement or
                remuneration has been offered.
              </li>
              <li>
                Donation of blood/components is a medical procedure and that by
                donating voluntarily, I accept the risk associated with this
                procedure.
              </li>
              <li>
                My donated blood, blood and plasma recovered from my donated
                blood may be sent for plasma fractionation for preparation of
                plasma-derived medical products, all of which may be used for
                larger patient population and not just this blood centre.
              </li>
              <li>
                My blood will be tested for Hepatitis B, Hepatitis C, Malaria
                Parasite, HIV/AIDS and Syphilis disease in addition to any other
                screening tests required to ensure blood safety.
              </li>
            </ol>
          </div>

          <div className="q-row" style={{ marginTop: 8 }}>
            <span className="q-label">
              <strong>
                (e) I would like to be informed about any abnormal test results
                done on my donated blood:
              </strong>
            </span>
            <div className="q-options">
              <button
                type="button"
                className={`btn-yn ${consentAbnormalResults === "YES" ? "active-yes" : ""}`}
                onClick={() => setConsentAbnormalResults("YES")}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-yn ${consentAbnormalResults === "NO" ? "active-no" : ""}`}
                onClick={() => setConsentAbnormalResults("NO")}
              >
                No
              </button>
            </div>
          </div>

          <label
            className="row"
            style={{
              marginTop: 12,
              alignItems: "flex-start",
              cursor: "pointer",
            }}
          >
            <span className="small">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                style={{
                  marginTop: 4,
                  width: "fit-content",
                  height: "fit-content",
                }}
              />
              <strong>Donor Digital Signature / Declaration:</strong> I confirm
              that the details provided by me are true to the best of my
              knowledge and I agree to proceed with the voluntary blood
              donation.
            </span>
          </label>

          {validationError && (
            <div className="note note-red" style={{ marginTop: 8 }}>
              {validationError}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
