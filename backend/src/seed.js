/**
 * Realistic seed data generator for Raktasetu:
 * - 30 Institutions across Mumbai & Navi Mumbai (Blood banks & hospital transfusion centres)
 * - 1,500 Donors (Mumbai & Navi Mumbai residents with varied blood groups, eligibility states, and donation histories)
 * - Daily usage records, confirmed thresholds, stock levels, emergency requests, and blood camps.
 */
import bcrypt from 'bcryptjs';
import { COLLECTIONS, createDoc, listDocs, getPgPool, getDbMode } from './db/index.js';
import { defaultPreferences } from './services/donorService.js';
import { setStock, confirmThreshold } from './services/thresholdService.js';
import { detectBreaches, dispatchNotifications, raiseManualRequest } from './services/requestService.js';
import { isoDay, addDays } from './services/eligibility.js';

const hash = (p) => bcrypt.hashSync(p, 8);
const day = (offset) => isoDay(addDays(new Date(), offset));

const BLOOD_GROUPS_WEIGHTED = [
  ...Array(38).fill('O+'),
  ...Array(30).fill('B+'),
  ...Array(20).fill('A+'),
  ...Array(5).fill('AB+'),
  ...Array(3).fill('O-'),
  ...Array(2).fill('B-'),
  ...Array(1).fill('A-'),
  ...Array(1).fill('AB-'),
];

const FIRST_NAMES_MALE = [
  'Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Rohan', 'Vivaan', 'Kabir', 'Dhruv',
  'Vikram', 'Rahul', 'Farhan', 'Imran', 'Sameer', 'Kiran', 'Manish', 'Sanjay', 'Suresh', 'Ramesh',
  'Amit', 'Pradeep', 'Alok', 'Nikhil', 'Gaurav', 'Anand', 'Rajesh', 'Vivek', 'Sachin', 'Mohit',
  'Harsh', 'Tushar', 'Akash', 'Kunal', 'Dev', 'Yash', 'Varun', 'Chetan', 'Abhishek', 'Mayank',
];

const FIRST_NAMES_FEMALE = [
  'Priya', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Ishita', 'Riya', 'Sneha', 'Pooja',
  'Tanvi', 'Anita', 'Deepa', 'Nisha', 'Meera', 'Sunita', 'Kavita', 'Shweta', 'Swati', 'Pooja',
  'Divya', 'Neha', 'Ritu', 'Pallavi', 'Shalini', 'Komal', 'Radhika', 'Archana', 'Bhavna', 'Geeta',
  'Shruti', 'Monika', 'Preeti', 'Juhi', 'Payal', 'Simran', 'Rashmi', 'Mansi', 'Sakshi', 'Anjali',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Verma', 'Mehta', 'Joshi', 'Deshmukh', 'Kulkarni', 'Patil', 'Rao', 'Nair',
  'Gupta', 'Shetty', 'Pawar', 'Iyer', 'Desai', 'Sheikh', 'Bhosale', 'Singh', 'Kumar', 'Chatterjee',
  'Reddy', 'Yadav', 'Agarwal', 'Shah', 'Khan', 'Mishra', 'Pandey', 'Mukherjee', 'Sen', 'Chavan',
  'Gaikwad', 'Shinde', 'Sawant', 'Mane', 'More', 'Chopra', 'Malhotra', 'Bhatia', 'Menon', 'Pillai',
];

// 30 Premier Blood Centres across Mumbai and Navi Mumbai
const INSTITUTION_SPECS = [
  // Mumbai - Premier & Government Blood Centres
  { name: 'City Hospital Blood Bank (KEM Regional Centre)', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'KEM Hospital & Seth G.S. Medical College', city: 'Mumbai', state: 'Maharashtra', pin: '400012', lic: 'MH-BB-2019-0431', email: 'bloodbank@cityhospital.in', phone: '+91 22 2410 7000', verified: true, staffEmail: 'staff@citybank.in', staffName: 'Anita Deshmukh' },
  { name: 'Tata Memorial Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Tata Memorial Centre, Parel', city: 'Mumbai', state: 'Maharashtra', pin: '400012', lic: 'MH-BB-2016-0082', email: 'bloodcentre@tmc.gov.in', phone: '+91 22 2417 7000', verified: true, staffEmail: 'staff.tmc@raktasetu.in', staffName: 'Dr. Sunil Kadam' },
  { name: 'Lilavati Hospital & Research Centre Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Lilavati Hospital Bandra', city: 'Mumbai', state: 'Maharashtra', pin: '400050', lic: 'MH-BB-2018-0245', email: 'bloodbank@lilavatihospital.com', phone: '+91 22 2675 1000', verified: true, staffEmail: 'staff.lilavati@raktasetu.in', staffName: 'Sunita Narvekar' },
  { name: 'Kokilaben Dhirubhai Ambani Hospital Blood Centre', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Kokilaben Hospital Andheri', city: 'Mumbai', state: 'Maharashtra', pin: '400053', lic: 'MH-BB-2017-0318', email: 'bloodbank@kdah.com', phone: '+91 22 3099 9999', verified: true, staffEmail: 'staff.kdah@raktasetu.in', staffName: 'Dr. Rajesh Shah' },
  { name: 'LTMG Sion Municipal Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Lokmanya Tilak Municipal General Hospital', city: 'Mumbai', state: 'Maharashtra', pin: '400022', lic: 'MH-BB-2015-0112', email: 'bloodbank@ltmgh.com', phone: '+91 22 2407 6381', verified: true, staffEmail: 'staff.sion@raktasetu.in', staffName: 'Pooja Sawant' },
  { name: 'Sir H.N. Reliance Foundation Hospital Blood Centre', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Reliance Foundation Hospital Girgaon', city: 'Mumbai', state: 'Maharashtra', pin: '400004', lic: 'MH-BB-2020-0511', email: 'transfusion@rfhospital.org', phone: '+91 22 6130 5000', verified: true, staffEmail: 'staff.reliance@raktasetu.in', staffName: 'Gaurav Kothari' },
  { name: 'P.D. Hinduja National Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Hinduja Hospital Mahim', city: 'Mumbai', state: 'Maharashtra', pin: '400016', lic: 'MH-BB-2016-0199', email: 'bloodbank@hindujahospital.com', phone: '+91 22 2445 1515', verified: true, staffEmail: 'staff.hinduja@raktasetu.in', staffName: 'Kavita Mhatre' },
  { name: 'Bombay Hospital Trust Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Bombay Hospital Marine Lines', city: 'Mumbai', state: 'Maharashtra', pin: '400020', lic: 'MH-BB-2014-0044', email: 'bloodbank@bombayhospital.com', phone: '+91 22 2206 7676', verified: true, staffEmail: 'staff.bombayhosp@raktasetu.in', staffName: 'Dr. Shrikant Joshi' },
  { name: 'Dr. R.N. Cooper Municipal Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Cooper Hospital Juhu', city: 'Mumbai', state: 'Maharashtra', pin: '400056', lic: 'MH-BB-2018-0439', email: 'cooperbloodbank@mcgm.gov.in', phone: '+91 22 2620 7254', verified: true, staffEmail: 'staff.cooper@raktasetu.in', staffName: 'Chetan Jadhav' },
  { name: 'Fortis Hospital Blood Bank Mulund', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Fortis Hospital Mulund Goregaon Link Road', city: 'Mumbai', state: 'Maharashtra', pin: '400080', lic: 'MH-BB-2019-0601', email: 'bloodbank.mulund@fortishealthcare.com', phone: '+91 22 6799 4444', verified: true, staffEmail: 'staff.fortis@raktasetu.in', staffName: 'Snehal More' },
  { name: 'Dr. L.H. Hiranandani Hospital Blood Centre', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Hiranandani Hospital Powai', city: 'Mumbai', state: 'Maharashtra', pin: '400076', lic: 'MH-BB-2018-0382', email: 'bloodbank@hiranandanihospital.org', phone: '+91 22 2576 3300', verified: true, staffEmail: 'staff.hiranandani@raktasetu.in', staffName: 'Kunal Salvi' },
  { name: 'B.Y.L. Nair Charitable Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Nair Hospital Mumbai Central', city: 'Mumbai', state: 'Maharashtra', pin: '400008', lic: 'MH-BB-2015-0210', email: 'nairbloodbank@mcgm.gov.in', phone: '+91 22 2302 7000', verified: true, staffEmail: 'staff.nair@raktasetu.in', staffName: 'Ramesh Rane' },
  { name: 'Nanavati Max Super Speciality Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Nanavati Hospital Vile Parle West', city: 'Mumbai', state: 'Maharashtra', pin: '400056', lic: 'MH-BB-2019-0520', email: 'bloodbank@nanavatimaxhospital.org', phone: '+91 22 2618 2255', verified: true, staffEmail: 'staff.nanavati@raktasetu.in', staffName: 'Pratibha Tambe' },
  { name: 'Sarvodaya Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Sarvodaya Hospital Ghatkopar West', city: 'Mumbai', state: 'Maharashtra', pin: '400086', lic: 'MH-BB-2017-0290', email: 'bloodbank@sarvodayahospital.org', phone: '+91 22 2515 2222', verified: true, staffEmail: 'staff.sarvodaya@raktasetu.in', staffName: 'Nilesh Vaze' },
  { name: 'Karuna Hospital Blood Bank', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Karuna Hospital Borivali West', city: 'Mumbai', state: 'Maharashtra', pin: '400092', lic: 'MH-BB-2020-0477', email: 'bloodbank@karunahospital.com', phone: '+91 22 6159 0200', verified: true, staffEmail: 'staff.karuna@raktasetu.in', staffName: 'Sister Mary Fernandes' },
  { name: 'Shree Manav Seva Sangh Blood Centre', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Mumbai', state: 'Maharashtra', pin: '400022', lic: 'MH-BB-2014-0095', email: 'manavsevablood@gmail.com', phone: '+91 22 2407 1553', verified: true, staffEmail: 'staff.manavseva@raktasetu.in', staffName: 'Hitesh Parekh' },
  { name: 'Samarth Blood Centre Kurla', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Mumbai', state: 'Maharashtra', pin: '400070', lic: 'MH-BB-2023-1102', email: 'samarthblood@kurla.org', phone: '+91 22 2503 4455', verified: false, staffEmail: 'staff.samarth@raktasetu.in', staffName: 'Ajay Shinde' },
  { name: 'Apex Suburban Blood Centre Kandivali', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Mumbai', state: 'Maharashtra', pin: '400067', lic: 'MH-BB-2024-0155', email: 'apexblood@kandivali.org', phone: '+91 22 2801 8899', verified: false, staffEmail: 'staff.apexsuburban@raktasetu.in', staffName: 'Vikas Mishra' },

  // Navi Mumbai - Premier, Trust & Municipal Blood Centres
  { name: 'Apollo Hospitals Blood Centre Belapur', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Apollo Hospitals CBD Belapur', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400614', lic: 'MH-BB-2018-0512', email: 'bloodbank_belapur@apollohospitals.com', phone: '+91 22 3350 3350', verified: true, staffEmail: 'staff.apollo@raktasetu.in', staffName: 'Meenakshi Sundaram' },
  { name: 'Dr. D.Y. Patil Hospital Blood Bank Nerul', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Dr D.Y. Patil Hospital Nerul', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400706', lic: 'MH-BB-2016-0233', email: 'bloodbank@dypatil.edu', phone: '+91 22 2770 0000', verified: true, staffEmail: 'staff.dypatil@raktasetu.in', staffName: 'Dr. Mahesh Bhosale' },
  { name: 'Fortis Hiranandani Blood Bank Vashi', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'Fortis Hiranandani Hospital Vashi', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400703', lic: 'MH-BB-2017-0349', email: 'bloodbank.vashi@fortishealthcare.com', phone: '+91 22 3919 9222', verified: true, staffEmail: 'staff.fortisvashi@raktasetu.in', staffName: 'Ashwini Gaikwad' },
  { name: 'MGM New Bombay Hospital Blood Centre Vashi', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'MGM Hospital Vashi Sector 3', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400703', lic: 'MH-BB-2015-0188', email: 'bloodbank@mgmhospitalvashi.net', phone: '+91 22 2782 2203', verified: true, staffEmail: 'staff.mgmvashi@raktasetu.in', staffName: 'Nitin Chavan' },
  { name: 'ACTREC Tata Memorial Centre Blood Bank Kharghar', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'ACTREC Tata Memorial Centre Sector 22 Kharghar', city: 'Navi Mumbai', state: 'Maharashtra', pin: '410210', lic: 'MH-BB-2019-0671', email: 'bloodbank@actrec.gov.in', phone: '+91 22 2740 5000', verified: true, staffEmail: 'staff.actrec@raktasetu.in', staffName: 'Dr. Amol Pawar' },
  { name: 'National Burns Centre & Blood Bank Airoli', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'National Burns Centre Sector 13 Airoli', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400708', lic: 'MH-BB-2016-0410', email: 'nbcbloodbank@burns-india.com', phone: '+91 22 2769 0111', verified: true, staffEmail: 'staff.nbc@raktasetu.in', staffName: 'Sanjay Thorat' },
  { name: 'MGM Medical College Blood Bank Kamothe', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'MGM Medical College & Hospital Kamothe', city: 'Navi Mumbai', state: 'Maharashtra', pin: '410209', lic: 'MH-BB-2018-0422', email: 'bloodbank.kamothe@mgmmcnm.edu.in', phone: '+91 22 2743 7900', verified: true, staffEmail: 'staff.mgmkamothe@raktasetu.in', staffName: 'Dr. Suhas Patil' },
  { name: 'NMMC Municipal Blood Centre Vashi', type: 'BLOOD_BANK', category: 'IN_HOUSE', hospital: 'NMMC Hospital Sector 10 Vashi', city: 'Navi Mumbai', state: 'Maharashtra', pin: '400703', lic: 'MH-BB-2020-0580', email: 'nmmcbloodcentre@nmmconline.com', phone: '+91 22 2789 9901', verified: true, staffEmail: 'staff.nmmc@raktasetu.in', staffName: 'Sachin Ghuge' },
  { name: 'Rotary Club of Navi Mumbai Blood Bank', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Navi Mumbai', state: 'Maharashtra', pin: '400614', lic: 'MH-BB-2017-0255', email: 'rotaryblood.navimumbai@gmail.com', phone: '+91 22 2757 8899', verified: true, staffEmail: 'staff.rotarynm@raktasetu.in', staffName: 'Prakash Rao' },
  { name: 'Sunrise Voluntary Blood Centre', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Navi Mumbai', state: 'Maharashtra', pin: '400705', lic: 'MH-BB-2023-1188', email: 'contact@sunrisebloodcentre.in', phone: '+91 22 2775 1122', verified: false, staffEmail: 'staff@sunrise.in', staffName: 'Ravi Patil' },
  { name: 'Seawoods Charitable Blood Centre', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Navi Mumbai', state: 'Maharashtra', pin: '400706', lic: 'MH-BB-2024-0091', email: 'seawoodsblood@charity.org', phone: '+91 22 2772 3344', verified: false, staffEmail: 'staff.seawoods@raktasetu.in', staffName: 'Tushar Mane' },
  { name: 'Kharghar Medicity Voluntary Blood Centre', type: 'BLOOD_BANK', category: 'EXTERNAL', hospital: null, city: 'Navi Mumbai', state: 'Maharashtra', pin: '410210', lic: 'MH-BB-2024-0220', email: 'medicityblood@kharghar.org', phone: '+91 22 2774 5566', verified: false, staffEmail: 'staff.kharghar@raktasetu.in', staffName: 'Deepak Shelke' },
];

// Realistic Pincodes strictly within Mumbai & Navi Mumbai
const MUMBAI_NAVI_MUMBAI_PINCODES = [
  // South & Central Mumbai
  '400001', '400004', '400008', '400012', '400016', '400020', '400022', '400028',
  // Western Suburbs Mumbai
  '400050', '400053', '400056', '400063', '400064', '400067', '400092', '400093',
  // Eastern Suburbs Mumbai
  '400070', '400071', '400076', '400080', '400086',
  // Navi Mumbai (Vashi, Nerul, Belapur, Kharghar, Panvel, Airoli, Kopar Khairane, Sanpada, Kamothe, Seawoods)
  '400614', '400701', '400703', '400705', '400706', '400708', '400709', '410206', '410209', '410210',
];

export async function seedDemoData(options = {}) {
  const isDirect = options.force || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
  const existing = await listDocs(COLLECTIONS.users);

  if (!isDirect && existing.length >= 1000) {
    return { skipped: true };
  }

  if (getDbMode() === 'postgres') {
    const pool = getPgPool();
    if (pool) {
      console.log('[seed] Cleaning existing PostgreSQL records before populating 1,500 donors and 30 institutions...');
      for (const table of Object.values(COLLECTIONS)) {
        try {
          await pool.query(`DELETE FROM ${table};`);
        } catch (e) {
          // Table might not exist or empty
        }
      }
    }
  }

  console.log('[seed] Generating Mumbai & Navi Mumbai data: 30 institutions and 1,500 donors...');

  const adminHash = hash('admin123');
  const staffHash = hash('staff123');
  const donorHash = hash('donor123');

  /* ---- 1. Platform Admin User ---- */
  const admin = await createDoc(COLLECTIONS.users, {
    name: 'Platform Admin',
    email: 'admin@raktasetu.in',
    password_hash: adminHash,
    role: 'PLATFORM_ADMIN',
    institution_id: null,
    donor_id: null,
  });

  /* ---- 2. 30 Institutions & Staff in Mumbai & Navi Mumbai ---- */
  const institutions = [];
  const staffMembers = [];

  for (const spec of INSTITUTION_SPECS) {
    const inst = await createDoc(COLLECTIONS.institutions, {
      name: spec.name,
      type: spec.type,
      category: spec.category,
      linked_hospital_name: spec.hospital,
      verification_status: spec.verified ? 'VERIFIED' : 'PENDING',
      location: { city: spec.city, state: spec.state, pincode: spec.pin },
      licence_number: spec.lic,
      contact_email: spec.email,
      contact_phone: spec.phone,
      verified_by: spec.verified ? admin.id : null,
      verified_by_name: spec.verified ? admin.name : null,
      verified_at: spec.verified ? new Date().toISOString() : null,
    });
    institutions.push(inst);

    const staffUser = await createDoc(COLLECTIONS.users, {
      name: spec.staffName,
      email: spec.staffEmail,
      password_hash: staffHash,
      role: 'BLOOD_BANK_STAFF',
      institution_id: inst.id,
      donor_id: null,
    });
    staffMembers.push({ user: staffUser, institution: inst });
  }

  const primaryStaff = staffMembers[0]; // Anita Deshmukh @ KEM Hospital Regional Blood Centre
  const primaryActor = { id: primaryStaff.user.id, name: primaryStaff.user.name, role: 'BLOOD_BANK_STAFF', institution_id: primaryStaff.institution.id };

  /* ---- 3. Stock Levels, Thresholds & Usage Records for Verified Institutions ---- */
  const verifiedStaffs = staffMembers.filter((s) => s.institution.verification_status === 'VERIFIED');

  for (const { user, institution } of verifiedStaffs.slice(0, 10)) {
    const actor = { id: user.id, name: user.name, role: 'BLOOD_BANK_STAFF', institution_id: institution.id };
    const baseMultiplier = institution.id === primaryStaff.institution.id ? 1 : 0.8 + Math.random() * 0.5;

    // Stock levels
    const stocks = {
      'O+': Math.round(35 * baseMultiplier),
      'O-': institution.id === primaryStaff.institution.id ? 3 : Math.round(8 * baseMultiplier), // O- breach demo on primary
      'A+': Math.round(25 * baseMultiplier),
      'A-': Math.round(10 * baseMultiplier),
      'B+': Math.round(28 * baseMultiplier),
      'B-': Math.round(6 * baseMultiplier),
      'AB+': Math.round(12 * baseMultiplier),
      'AB-': Math.round(4 * baseMultiplier),
    };
    for (const [group, units] of Object.entries(stocks)) {
      await setStock(institution.id, group, units, actor);
    }

    // Confirmed thresholds
    await confirmThreshold(institution.id, { blood_group: 'O+', confirmed_threshold: Math.round(25 * baseMultiplier), note: 'Routine weekend emergency buffer' }, actor);
    await confirmThreshold(institution.id, { blood_group: 'O-', confirmed_threshold: Math.round(8 * baseMultiplier), note: 'Universal emergency reserve' }, actor);
    await confirmThreshold(institution.id, { blood_group: 'A+', confirmed_threshold: Math.round(18 * baseMultiplier) }, actor);
    await confirmThreshold(institution.id, { blood_group: 'B+', confirmed_threshold: Math.round(20 * baseMultiplier) }, actor);

    // 14 Days Daily Usage
    for (let d = 14; d >= 0; d--) {
      const date = day(-d);
      const weekendDip = [0, 6].includes(addDays(new Date(), -d).getDay()) ? 0.6 : 1;
      for (const [group, baseUnits] of Object.entries({ 'O+': 5, 'O-': 2, 'A+': 3, 'A-': 1, 'B+': 4, 'B-': 1, 'AB+': 1, 'AB-': 1 })) {
        const units = Math.max(0, Math.round((baseUnits * baseMultiplier + ((d + group.length) % 2)) * weekendDip));
        await createDoc(COLLECTIONS.usageRecords, {
          blood_bank_institution_id: institution.id,
          blood_group: group,
          units_issued: units,
          date,
          reported_by: user.id,
          reported_at: new Date().toISOString(),
        });
      }
    }

    // Community Blood Camps in Mumbai & Navi Mumbai
    const campLocations = [
      'Dadar West Community Hall, Mumbai',
      'Vashi Sector 17 Central Plaza, Navi Mumbai',
      'Nerul Gymkhana OPD Campus, Navi Mumbai',
      'Bandra Kurla Complex (BKC) Rotary Hall, Mumbai',
      'Kharghar Central Park Cultural Centre, Navi Mumbai',
      'Mulund West Gymkhana, Mumbai',
      'Andheri Sports Complex, Andheri West, Mumbai',
      'CBD Belapur Artists Village Community Centre, Navi Mumbai',
      'Sion West Municipal Community Centre, Mumbai',
      'Airoli Sector 5 Gymkhana Grounds, Navi Mumbai',
    ];
    const locIndex = (institution.name.length + d_index(institution.id)) % campLocations.length;
    await createDoc(COLLECTIONS.camps, {
      blood_bank_institution_id: institution.id,
      institution_name: institution.name,
      date: day(4 + (institution.name.length % 10)),
      start_time: '09:00',
      end_time: '16:00',
      location: campLocations[locIndex],
      pincode: institution.location.pincode,
      notes: 'Walk-ins welcome. Please eat a light meal before donating and carry a valid photo ID.',
      created_by: user.id,
      created_by_name: user.name,
    });
  }

  /* ---- 4. 1,500 Donors Generation (Mumbai & Navi Mumbai Residents) ---- */
  const donors = [];
  const primaryBank = institutions[0];

  // Specific initial 15 donors for predictable testing & demo credentials
  const initialSpecs = [
    { name: 'Priya Sharma', email: 'donor@example.com', group: 'B-', gender: 'FEMALE', last: -210, status: 'ACTIVE', pin: '400012' },
    { name: 'Arjun Mehta', email: 'arjun@example.com', group: 'B-', gender: 'MALE', last: -150, status: 'ACTIVE', pin: '400050' },
    { name: 'Sameer Kulkarni', email: 'sameer@example.com', group: 'B-', gender: 'MALE', last: -30, status: 'ACTIVE', pin: '400703' },
    { name: 'Nisha Verma', email: 'nisha@example.com', group: 'O+', gender: 'FEMALE', last: -400, status: 'ACTIVE', pin: '400012' },
    { name: 'Vikram Rao', email: 'vikram@example.com', group: 'O+', gender: 'MALE', last: -95, status: 'ACTIVE', pin: '400706' },
    { name: 'Farhan Ali', email: 'farhan@example.com', group: 'O+', gender: 'MALE', last: null, status: 'PROVISIONAL', pin: '400053' },
    { name: 'Deepa Nair', email: 'deepa@example.com', group: 'O-', gender: 'FEMALE', last: -300, status: 'ACTIVE', pin: '400614' },
    { name: 'Rahul Joshi', email: 'rahul@example.com', group: 'O-', gender: 'MALE', last: -20, status: 'ACTIVE', pin: '410210' },
    { name: 'Ananya Gupta', email: 'ananya@example.com', group: 'A+', gender: 'FEMALE', last: -180, status: 'ACTIVE', pin: '400080' },
    { name: 'Kiran Shetty', email: 'kiran@example.com', group: 'A+', gender: 'MALE', last: -60, status: 'ACTIVE', pin: '400708', deferral: 45 },
    { name: 'Manish Pawar', email: 'manish@example.com', group: 'A-', gender: 'MALE', last: -120, status: 'ACTIVE', pin: '400022' },
    { name: 'Sneha Iyer', email: 'sneha@example.com', group: 'AB+', gender: 'FEMALE', last: -365, status: 'ACTIVE', pin: '400076', paused: true },
    { name: 'Tanvi Desai', email: 'tanvi@example.com', group: 'AB-', gender: 'FEMALE', last: null, status: 'PENDING_REVIEW', pin: '410206', advised: true },
    { name: 'Imran Sheikh', email: 'imran@example.com', group: 'B+', gender: 'MALE', last: -140, status: 'ACTIVE', pin: '400008' },
    { name: 'Meera Bhosale', email: 'meera@example.com', group: 'B+', gender: 'FEMALE', last: -200, status: 'ACTIVE', pin: '400703', cap: 1 },
  ];

  for (let i = 0; i < 1500; i++) {
    let name, email, group, gender, lastDonationOffset, status, pin, advised = false, deferralOffset = null, paused = false, cap = 2;
    const inst = institutions[i % institutions.length];

    if (i < initialSpecs.length) {
      const spec = initialSpecs[i];
      name = spec.name;
      email = spec.email;
      group = spec.group;
      gender = spec.gender;
      lastDonationOffset = spec.last;
      status = spec.status;
      pin = spec.pin;
      advised = !!spec.advised;
      deferralOffset = spec.deferral || null;
      paused = !!spec.paused;
      cap = spec.cap || 2;
    } else {
      const isMale = (i % 2) === 0;
      gender = isMale ? 'MALE' : 'FEMALE';
      const fName = isMale ? FIRST_NAMES_MALE[i % FIRST_NAMES_MALE.length] : FIRST_NAMES_FEMALE[i % FIRST_NAMES_FEMALE.length];
      const lName = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length];
      name = `${fName} ${lName}`;
      email = `donor${i + 1}@raktasetu.in`;
      group = BLOOD_GROUPS_WEIGHTED[i % BLOOD_GROUPS_WEIGHTED.length];
      pin = MUMBAI_NAVI_MUMBAI_PINCODES[i % MUMBAI_NAVI_MUMBAI_PINCODES.length];

      // Status distribution (~88% ACTIVE, ~8% PROVISIONAL, ~4% PENDING_REVIEW)
      const mod = i % 100;
      if (mod < 4) {
        status = 'PENDING_REVIEW';
        advised = true;
        lastDonationOffset = null;
      } else if (mod < 12) {
        status = 'PROVISIONAL';
        lastDonationOffset = null;
      } else {
        status = 'ACTIVE';
        // Donation offset: mix of eligible (>90/120 days ago) and recent (<90 days ago)
        if (i % 3 === 0) {
          lastDonationOffset = -Math.floor(100 + (i % 250)); // Eligible
        } else if (i % 3 === 1) {
          lastDonationOffset = -Math.floor(10 + (i % 75)); // Recent, currently in waiting window
        } else {
          lastDonationOffset = null; // First-time active voluntary donor
        }
      }

      if (i % 40 === 0 && status === 'ACTIVE') {
        deferralOffset = 30; // 30 days future temporary deferral
      }
      if (i % 35 === 0) {
        paused = true;
      }
      cap = (i % 5 === 0) ? 1 : (i % 7 === 0 ? 3 : 2);
    }

    const birthYear = 1970 + (i % 35);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String((i % 28) + 1).padStart(2, '0');

    const donor = await createDoc(COLLECTIONS.donors, {
      name,
      email,
      gender,
      date_of_birth: `${birthYear}-${birthMonth}-${birthDay}`,
      blood_group_self_reported: group,
      blood_group_verified: lastDonationOffset ? group : null,
      contact_phone: `+91 ${isFinite(i) ? String(9800000000 + i * 37).slice(0, 10) : '9820001122'}`,
      area_pincode: pin,
      last_donation_date: lastDonationOffset ? day(lastDonationOffset) : null,
      donation_type: 'VOLUNTARY',
      patient_name: null,
      advised_not_to_donate_flag: advised,
      status,
      deferral_until_date: deferralOffset ? day(deferralOffset) : null,
      phone_verified: true,
      registered_institution_id: inst.id,
      preferences: {
        ...defaultPreferences(),
        paused,
        max_contacts_per_month: cap,
        preferred_institution_id: inst.id,
      },
      consent: {
        given: true,
        at: new Date(Date.now() - 86400000 * 30).toISOString(),
        purpose: 'Contacting me about blood donation needs at my registered blood bank in Mumbai/Navi Mumbai (DPDP Act 2023)',
        version: '1.0',
      },
    });
    donors.push(donor);

    // Create user login record
    await createDoc(COLLECTIONS.users, {
      name,
      email,
      password_hash: donorHash,
      role: 'DONOR',
      institution_id: null,
      donor_id: donor.id,
    });

    // Create historical donation records for donors with past history
    if (lastDonationOffset) {
      await createDoc(COLLECTIONS.donations, {
        donor_id: donor.id,
        institution_id: inst.id,
        request_id: null,
        units: 1,
        hb_level: Number((12.5 + (i % 4) * 0.4).toFixed(1)),
        date: day(lastDonationOffset),
      });
      if (lastDonationOffset < -240) {
        await createDoc(COLLECTIONS.donations, {
          donor_id: donor.id,
          institution_id: inst.id,
          request_id: null,
          units: 1,
          hb_level: Number((12.8 + (i % 3) * 0.3).toFixed(1)),
          date: day(lastDonationOffset - 120),
        });
      }
    }
  }

  /* ---- 5. Breach Detection & Emergency Request Demos on Primary Institution ---- */
  await detectBreaches(primaryBank.id);

  const manual = await raiseManualRequest(
    primaryBank.id,
    { blood_group: 'B-', units_needed: 2, urgency: 'HIGH', reason: 'Emergency cardiac surgery scheduled tomorrow morning at KEM Hospital' },
    primaryActor,
  );
  await dispatchNotifications(manual.id, primaryActor);

  const closed = await createDoc(COLLECTIONS.requests, {
    institution_id: primaryBank.id,
    blood_group: 'A+',
    units_needed: 3,
    urgency: 'NORMAL',
    origin: 'SCHEDULED',
    state: 'CLOSED',
    reason: 'Weekly collection target top-up',
    escalation_stage: 1,
    confirmed_by: primaryStaff.user.id,
    confirmed_by_name: primaryStaff.user.name,
    confirmed_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    created_by: 'system',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    state_history: ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED'].map((s, idx) => ({
      from: idx === 0 ? null : ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED'][idx - 1],
      to: s,
      at: new Date(Date.now() - 86400000 * (10 - idx)).toISOString(),
      by: idx <= 1 ? primaryStaff.user.id : 'system',
      by_name: idx <= 1 ? primaryStaff.user.name : 'system',
    })),
  });

  const aPlusDonor = donors.find((d) => d.blood_group_self_reported === 'A+');
  if (aPlusDonor) {
    await createDoc(COLLECTIONS.notifications, {
      donor_id: aPlusDonor.id,
      request_id: closed.id,
      institution_id: primaryBank.id,
      institution_name: primaryBank.name,
      blood_group: 'A+',
      channel: 'IN_APP',
      stage: 1,
      score: 70,
      sent_at: new Date(Date.now() - 86400000 * 9).toISOString(),
      response: 'ACCEPTED',
      response_at: new Date(Date.now() - 86400000 * 9 + 3600000).toISOString(),
      response_time_minutes: 60,
      message: `${primaryBank.name} needed A+ blood. Thank you for helping.`,
      closing_message: 'Thank you for stepping forward. This requirement has been met.',
    });
  }

  console.log(`[seed] Complete! Seeded ${institutions.length} Mumbai & Navi Mumbai institutions, ${staffMembers.length} staff users, and ${donors.length} donors.`);
  return { admin: admin.email, institutions: institutions.length, donors: donors.length };
}

function d_index(str) {
  let hashVal = 0;
  for (let i = 0; i < str.length; i++) hashVal = (hashVal << 5) - hashVal + str.charCodeAt(i);
  return Math.abs(hashVal);
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { initDb, closeDb } = await import('./db/index.js');
  await initDb();
  await seedDemoData();
  await closeDb();
  console.log('[seed] Seeding completed successfully.');
  process.exit(0);
}
