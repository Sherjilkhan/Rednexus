/**
 * googleSheetsService.js — Google Sheets via Apps Script Web App
 * Set GOOGLE_APPS_SCRIPT_URL in backend/.env
 */

// Read at call time, not module load time — ensures .env is loaded first
function getScriptUrl() {
  return process.env.GOOGLE_APPS_SCRIPT_URL || '';
}

function flattenForSheet(doc) {
  const q  = doc.questionnaire        || {};
  const p  = q.personal               || {};
  const s1 = q.previous_donations     || {};
  const s2 = q.current_wellness       || {};
  const s4 = q.past_12_months         || {};
  const s5 = q.hepatitis_and_jaundice || {};

  return {
    id:                    doc.id || '',
    source:                doc.source || '',
    donor_id:              doc.donor_id || '',
    camp_id:               doc.camp_id || '',
    notification_id:       doc.notification_id || '',
    submitted_at:          doc.submitted_at || new Date().toISOString(),
    name:                  p.name || '',
    gender:                p.gender || '',
    dob:                   p.date_of_birth || '',
    age:                   String(p.age || ''),
    mobile:                p.mobile || '',
    email:                 p.email || '',
    occupation:            p.occupation || '',
    address:               p.address || '',
    nationality:           p.nationality || '',
    donation_type:         p.donation_type || '',
    donated_before:        s1.donated_previously || '',
    donation_count:        s1.donation_count || '',
    last_donation_date:    s1.last_donation_date || '',
    had_discomfort:        s1.had_discomfort_previously || '',
    advised_not_to_donate: s1.advised_not_to_donate || '',
    feeling_well:          s2.feeling_well_today || '',
    eaten_4hrs:            s2.eaten_last_4_hours || '',
    heavy_work_today:      s2.heavy_work_or_driving_today || '',
    medical_conditions:    (q.medical_conditions || []).join(', '),
    received_blood_12m:    s4.received_blood_12m || '',
    accidents_12m:         s4.accidents_operations_12m || '',
    typhoid_12m:           s4.typhoid_12m || '',
    animal_bite_12m:       s4.animal_bite_rabies_12m || '',
    tattoo_12m:            s4.tattoo_piercing_acupuncture_12m || '',
    imprisoned_12m:        s4.imprisoned_12m || '',
    jaundice_1y:           s5.jaundice_1y || '',
    hepatitis_positive:    s5.hepatitis_tested_positive || '',
    hepatitis_contact_1y:  s5.hepatitis_contact_1y || '',
    malaria_3m:            q.malaria_last_3m || '',
    dental_6m:             q.dental_chikungunya_dengue_6m || '',
    antibiotics_2w:        q.antibiotics_vaccines_2w || '',
    other_medications:     q.other_medications || '',
    blood_group:           q.blood_group || p.blood_group || doc.blood_group || '',
    institution_name:      doc.institution_name || q.institution_name || '',
  };
}

export async function appendToSheet(doc) {
  const SCRIPT_URL = getScriptUrl();
  
  console.log('[Sheets] SCRIPT_URL =', SCRIPT_URL || 'NOT SET');

  if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
    console.warn('[Sheets] ⚠️  GOOGLE_APPS_SCRIPT_URL not configured in .env — skipping');
    return;
  }

  try {
    const flat    = flattenForSheet(doc);
    const json    = JSON.stringify(flat);
    const encoded = encodeURIComponent(json);
    const url     = `${SCRIPT_URL}?data=${encoded}`;

    console.log(`[Sheets] Sending (${doc.source}) — payload ${json.length} chars, URL ${url.length} chars`);

    const res  = await fetch(url, { method: 'GET', redirect: 'follow' });
    const text = await res.text();

    console.log(`[Sheets] HTTP ${res.status} — raw response: ${text.slice(0, 300)}`);

    if (text.trim().startsWith('<')) {
      throw new Error(
        'Apps Script returned HTML (not JSON). ' +
        'Re-deploy the script: Deploy → Manage deployments → Edit → ' +
        '"Who has access: Anyone" → New version → Deploy'
      );
    }

    const data = JSON.parse(text);
    if (!data.success) throw new Error(data.error || 'success:false from Apps Script');
    console.log(`[Sheets] ✅ Row saved for ${doc.id}`);
  } catch (err) {
    console.error('[Sheets] ❌ Error:', err.message);
  }
}

export async function testSheetConnection() {
  const SCRIPT_URL = getScriptUrl();
  console.log('[Sheets] Testing connection to:', SCRIPT_URL || 'NOT SET');

  const testDoc = {
    id:               `test-${Date.now()}`,
    source:           'TEST',
    donor_id:         'test-donor',
    camp_id:          null,
    notification_id:  null,
    institution_name: 'Test Blood Bank',
    submitted_at:     new Date().toISOString(),
    questionnaire: {
      blood_group: 'O+',
      personal: { name: 'Test Donor', gender: 'MALE', mobile: '9999999999', email: 'test@test.com', age: 25 },
      previous_donations: { donated_previously: 'YES', donation_count: '2' },
      current_wellness:   { feeling_well_today: 'YES', eaten_last_4_hours: 'YES', heavy_work_or_driving_today: 'NO' },
      past_12_months: {}, hepatitis_and_jaundice: {}, medical_conditions: [],
    },
  };

  await appendToSheet(testDoc);
  return { tested: true, script_url: SCRIPT_URL || 'NOT SET' };
}