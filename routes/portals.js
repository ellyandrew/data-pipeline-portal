const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const db = require('../config/db');
const portalController = require('../controllers/portalController');
const { getPaginationRange } = require('../utils/pagination');
const regionMap = require('../utils/regionMap');
const membershipDocsUpload = require('../uploadsConfig/membershipDocs');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/logger');
const { getUserNotifications } = require('../controllers/portalNotification');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// ------------------------------------------------------------------------------------------------
// GET NOTIFICATIONS & NAME
// ------------------------------------------------------------------------------------------------
router.use(getUserNotifications);

// ------------------------------------------------------------------------------------------------
// 1. ADD MEMBER
// ------------------------------------------------------------------------------------------------

router.get('/add-member', (req, res) => {
  if (!req.session.userId) {
      req.session.messsage = 'Session expired, please try again!';
      req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const draft = req.session.registrationDraft;

  res.render('portal/add-member', {
    // step: draft.isStep,
    data: draft || {},
    value: req.session.values || {}
  });
});

// -----------------------------------------------------------------------------------------------
// GET DRAFT MEMBER
// -----------------------------------------------------------------------------------------------
router.get('/draft', async (req, res) => {

  if (!req.session.userId) {
    req.session.message = 'Session expired, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const draft = req.session.memberDraft;

  if (!draft) {
    req.session.message = 'Draft not found!';
    req.session.messageType = 'error';
    return res.redirect('/portal/members');
  }

  try {
    const [member] = await db.query(
      `SELECT * FROM members_tbl WHERE member_id = ? AND membership_no = ? LIMIT 1`,
      [draft.member_id, draft.membership_no]
    );

    if (member.length === 0) {
      req.session.message = 'Draft not found!';
      req.session.messageType = 'error';
      return res.redirect('/portal/members');
    }

    const membershipType = member[0].membership_type;

    const [profileRows] = await db.query(`SELECT * FROM member_profile_tbl WHERE member_id = ? LIMIT 1`, [draft.member_id]);

    const [facilityRows] = await db.query(`SELECT * FROM facilities_tbl WHERE member_id = ? LIMIT 1`, [draft.member_id]);


    const [benefitRows] = await db.query(`SELECT * FROM benefits_tbl WHERE member_id = ? LIMIT 1`, [draft.member_id]);

    let hasProfile = profileRows.length > 0;
    let profile = hasProfile ? profileRows[0] : {};

    let hasFacility = facilityRows.length > 0;
    let facility = hasFacility ? facilityRows[0] : {};

    let hasBenefits = benefitRows.length > 0;
    let benefits = hasBenefits ? benefitRows[0] : {};

    return res.render('portal/draft', {
      draft,
      member: member[0],
      profile,
      hasProfile,
      facility,
      hasFacility,
      benefits,
      hasBenefits,
      membershipType
    });

  } catch (err) {
    console.error(err);
    req.session.message = err.message;
    req.session.messageType = 'error';
    return res.redirect('/portal/members');
  }
});

// -----------------------------------------------------------------------------------------------
// GET COUNTY , SUB-COUNTY & WARDS
// ----------------------------------------------------------------------------------------------
router.get("/api/regions/counties", (req, res) => { // Get all counties
  const counties = Object.keys(regionMap).map(name => ({ name, code: regionMap[name].code }));
  res.json(counties);
});
// -----------------------------------------------------------------------------------------------
router.get("/api/regions/subcounties/:county", (req, res) => { // Get subcounties by county
  const { county } = req.params;
  if (!regionMap[county]) return res.status(404).json({ error: "County not found" });
  const subcounties = Object.keys(regionMap[county].subcounties).map(name => ({
    name,
    code: regionMap[county].subcounties[name].code
  }));
  res.json(subcounties);
});
// -----------------------------------------------------------------------------------------------
router.get("/api/regions/wards/:county/:subcounty", (req, res) => { // Get wards by county + subcounty
  const { county, subcounty } = req.params;
  if (!regionMap[county] || !regionMap[county].subcounties[subcounty]) {
    return res.status(404).json({ error: "Subcounty not found" });
  }
  const wards = regionMap[county].subcounties[subcounty].wards;
  res.json(wards);
});

// ----------------------------------------------------------------------------------------------
// REGISTER MEMBER LOGIC
// ----------------------------------------------------------------------------------------------
router.post('/add-member', ensureAuthenticated, ensureRole(['Admin', 'Data Clerk', 'Champion']), portalController.addMember); 

router.post('/add-member-profile', ensureAuthenticated, membershipDocsUpload.fields([ { name: "memberDoc", maxCount: 1 }, { name: "memberIdDoc", maxCount: 1 } ]), portalController.addMemberProfile);

router.post('/add-facility-details', ensureAuthenticated, portalController.addMemberFacility);

router.post('/add-member-benefits', ensureAuthenticated, portalController.addMemberBenefits);

router.post('/confirm-member-details', ensureAuthenticated, portalController.memberDetailsConfirm);

// ---------------------------------------------------------------------------------------------
// COMPLETE MEMBER DRAFT LOGIC
// ---------------------------------------------------------------------------------------------

router.post('/get-draft-member', ensureAuthenticated, ensureRole(['Admin', 'Data Clerk', 'Champion']), portalController.getDraftMember);
router.post('/add-draft-member-profile', ensureAuthenticated, membershipDocsUpload.fields([ { name: "memberDoc", maxCount: 1 }, { name: "memberIdDoc", maxCount: 1 } ]), portalController.addMemberProfileDraft);
router.post('/add-draft-facility-details', ensureAuthenticated, portalController.addMemberFacilityDraft);
router.post('/add-draft-member-benefits', ensureAuthenticated, portalController.addMemberBenefitsDraft);
router.post('/confirm-draft-member-details', ensureAuthenticated, portalController.memberDetailsConfirmDraft);

// --------------------------------------------------------------------------------------------
// GET PREVIEWS
// --------------------------------------------------------------------------------------------
router.get('/previous-profile', portalController.getPreviousProfile);
router.get('/previous-facility', portalController.getPreviousFacility);
router.get('/previous-benefit', portalController.getPreviousBenefits);

// --------------------------------------------------------------------------------------------
// VIEW MEMBER, FACILITY, 
// --------------------------------------------------------------------------------------------

router.post('/view-member', ensureAuthenticated, portalController.getMemberDetails);

// -------------------------------------------------------------------------------------------
// 2. DASHBOARD OVERVIEW
// -------------------------------------------------------------------------------------------
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
      // 1) Beneficiaries stats
        // ------------------------------------------------------------------------
        // const [beneficiaryCounts] = await db.query(`SELECT 
        //     SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS beneficiary_this_year,
        //     SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) - 1 THEN 1 ELSE 0 END) AS beneficiary_last_year, COUNT(*) AS total_beneficiaries
        //     FROM beneficiaries_tbl
        // `);
        //     const thisYear = beneficiaryCounts[0].beneficiary_this_year || 0;
        //     const lastYear = beneficiaryCounts[0].beneficiary_last_year || 0;
        //     const total = beneficiaryCounts[0].total_beneficiaries || 0;

        //     let beneficiary_percentageChange = 0;
        //     let beneficiary_trend = "No change";

        //     if (lastYear > 0) {
        //         beneficiary_percentageChange = ((thisYear - lastYear) / lastYear) * 100;
        //         beneficiary_trend = thisYear > lastYear ? "Increase" : "Decrease";
        //     } else if (lastYear === 0 && thisYear > 0) {
        //         beneficiary_percentageChange = ((thisYear) / total) * 100;
        //         beneficiary_trend = "Increase";
        //     } else {beneficiary_percentageChange = 0;
        //     beneficiary_trend = "No change";}

            const [facilityCapacity] = await db.query(`SELECT SUM(total_beneficiaries) AS total_b, SUM(total_caregivers) AS total_c FROM facilities_tbl`);
              const totalBeneficiary = facilityCapacity[0].total_b;
              const totalCaregiver = facilityCapacity[0].total_c;

            const facilityPeople = {totalBeneficiary, totalCaregiver};

            // 2) Facilities stats
            // -----------------------------------------------------------------------------------
            const [facilityCounts] = await db.query(`SELECT 
            SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS facility_this_year,
            SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) - 1 THEN 1 ELSE 0 END) AS facility_last_year, COUNT(*) AS total_facilities
            FROM facilities_tbl
            `);
            const facility_thisYear = facilityCounts[0].facility_this_year || 0;
            const facility_lastYear = facilityCounts[0].facility_last_year || 0;
            const total_facility = facilityCounts[0].total_facilities || 0;

            let facility_percentageChange = 0;
            let facility_trend = "No change";

            if (facility_lastYear > 0) {
                facility_percentageChange = ((facility_thisYear - facility_lastYear) / facility_lastYear) * 100;
                facility_trend = facility_thisYear > facility_lastYear ? "Increase" : "Decrease";
            }else if (facility_lastYear === 0 && facility_thisYear > 0) {
                facility_percentageChange = ((facility_thisYear) / total_facility) * 100;
                facility_trend = "Increase";
            } else {facility_percentageChange = 0;
            facility_trend = "No change";}

            const facilityStats = {facility_thisYear, facility_lastYear, total_facility, percentageChangeFT: facility_percentageChange.toFixed(2) + "%", facility_trend};

            // 3) Members stats
            // -----------------------------------------------------------------------------------
            const [membersCounts] = await db.query(`SELECT 
            SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS member_this_year,
            SUM(CASE WHEN YEAR(reg_date) = YEAR(CURDATE()) - 1 THEN 1 ELSE 0 END) AS member_last_year, COUNT(*) AS total_members
            FROM members_tbl
            `);
            const member_thisYear = membersCounts[0].facility_this_year || 0;
            const member_lastYear = membersCounts[0].facility_last_year || 0;
            const total_member = membersCounts[0].total_members || 0;

            let member_percentageChange = 0;
            let member_trend = "No change";

            if (member_lastYear > 0) {
                member_percentageChange = ((member_thisYear - member_lastYear) / member_lastYear) * 100;
                member_trend = member_thisYear > member_lastYear ? "Increase" : "Decrease";
            }else if (member_lastYear === 0 && member_thisYear > 0) {
                member_percentageChange = ((member_thisYear) / total_member) * 100;
                member_trend = "Increase";
            } else {member_percentageChange = 0;
            member_trend = "No change";}

            const membersStats = {member_thisYear, member_lastYear, total_member, percentageChangeMB: member_percentageChange.toFixed(2) + "%", member_trend};


      return res.render('portal/dashboard', { facilityPeople, facilityStats, membersStats });


  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ------------------------------------------------------------------------------------------------
// FETCH MEMBERS TABLE, VIEW MEMBER DETAILS
// ------------------------------------------------------------------------------------------------

router.get('/members', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const filters = {
      search: (req.query.search || '').trim(),
      county: req.query.county,
      subcounty: req.query.subcounty,
      ward: req.query.ward,
      status: req.query.status,
      type: req.query.type,
      ageGroup: req.query.ageGroup
  }

  let conditions = [];
  let params = [];

  conditions.push(`m.membership_no IS NOT NULL`);

  if (filters.search) {
    conditions.push(`
      (m.full_name LIKE ? OR p.phone LIKE ? OR m.membership_no LIKE ?)
    `);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  const counties = Array.isArray(filters.county)
    ? filters.county.filter(c => c && c.trim() !== '')
    : filters.county
    ? [filters.county]
    : [];

  const multipleCounties = counties.length > 1;

  if (counties.length > 0) {
    if (multipleCounties) {
      conditions.push(`p.county IN (${counties.map(() => '?').join(',')})`);
      params.push(...counties);
    } else {
      conditions.push(`p.county = ?`);
      params.push(counties[0]);
    }
  }

  if (filters.subcounty && !multipleCounties) {
    conditions.push(`p.sub_county = ?`);
    params.push(filters.subcounty);
  }

  if (filters.ward && !multipleCounties) {
    conditions.push(`p.ward = ?`);
    params.push(filters.ward);
  }

  if (filters.type) {
    conditions.push(`m.membership_type = ?`);
    params.push(filters.type);
  }

  if (filters.status) {
    conditions.push(`m.status = ?`);
    params.push(filters.status);
  }

  if (filters.ageGroup) {
    const today = new Date();
    let startDate, endDate;

    switch (filters.ageGroup) {
      case '18-25':
        startDate = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        conditions.push(`p.dob BETWEEN ? AND ?`);
        params.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        break;

      case '26-35':
        startDate = new Date(today.getFullYear() - 35, today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear() - 26, today.getMonth(), today.getDate());
        conditions.push(`p.dob BETWEEN ? AND ?`);
        params.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        break;

      case '36-45':
        startDate = new Date(today.getFullYear() - 45, today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear() - 36, today.getMonth(), today.getDate());
        conditions.push(`p.dob BETWEEN ? AND ?`);
        params.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        break;

      case '46-60':
        startDate = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear() - 46, today.getMonth(), today.getDate());
        conditions.push(`p.dob BETWEEN ? AND ?`);
        params.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        break;

      case '60-100':
        endDate = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate());
        conditions.push(`p.dob <= ?`);
        params.push(endDate.toISOString().split('T')[0]);
        break;
    }

  conditions.push(`p.dob IS NOT NULL`);
} else {
  conditions.push(`(p.dob IS NULL OR p.dob IS NOT NULL)`);
}


  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // 🔹 Step 1: Count total (members same WHERE conditions)
    const [countResult] = await db.execute(
      `SELECT COUNT(DISTINCT m.member_id) AS total FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // 🔹 Step 2: Fetch member_ids for this page
    const [memberIdsResult] = await db.execute(
      `SELECT m.member_id 
       FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id ${whereSQL} ORDER BY m.reg_date DESC OFFSET ? LIMIT ?`, 
       [...params, Number(offset), Number(perPage)]
    );

    const memberIds = memberIdsResult.map(r => r.member_id);
    let members = [];

    if (memberIds.length > 0) {
      // 🔹 Step 3: Fetch details for just those IDs
      const [results] = await db.query(
        `SELECT m.member_id, m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.membership_type, m.status, m.reg_date, p.phone, p.gender,
        p.county, p.sub_county, p.ward FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id 
        WHERE m.member_id IN (?) 
        ORDER BY m.reg_date DESC`,
        [memberIds]
      );
      members = results;
    }

    // For county & sub county dropdowns
    const [countiesList] = await db.query(`SELECT DISTINCT county FROM member_profile_tbl WHERE county IS NOT NULL`);

    let subcounties = [];
    let wards = [];

    if (counties.length === 1) {
      [subcounties] = await db.query(`SELECT DISTINCT sub_county FROM member_profile_tbl WHERE county = ?`, [counties[0]]);
    }
    if (filters.subcounty && !multipleCounties) {
      [wards] = await db.query(`SELECT DISTINCT ward FROM member_profile_tbl WHERE sub_county = ?`, [filters.subcounty]);
    }

    res.render('portal/members', {
      total,
      members,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search: filters.search,
      county: filters.county,
      subcounty: filters.subcounty,
      ward: filters.ward,
      status: filters.status,
      type: filters.type,
      ageGroup: filters.ageGroup,
      counties: countiesList.map(c => c.county),
      subcounties: subcounties.map(s => s.sub_county),
      wards: wards.map(w => w.ward),
      statusOptions: ['Active', 'Inactive', 'Draft', 'Pending', 'Suspended'],
      membershipType: ['Facility In', 'Individual', 'Sacco In']
    });
  } catch (error) {
    console.error('Members fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/view-member', ensureAuthenticated, async (req, res) => {
  
  const memberId = req.session.memberDetails;

  if (!memberId) {
    req.session.message = 'Member not found!';
    req.session.messageType = 'error';
    return res.redirect('/portal/members');
  }

  try {

    let benefits = null;
    
      const [results] = await db.query(
        `SELECT m.member_id, m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name, p.dob,
          m.status, m.reg_date, p.phone, p.gender, p.id_number, p.county, p.sub_county, p.ward, p.disability, p.education_level, p.next_kin_name,
          p.kin_rln, p.kin_phone, p.kin_location, p.member_doc, p.member_id_doc
         FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id 
         WHERE m.member_id = ? LIMIT 1`,
        [memberId]
      );

      if (results.length === 0) {
        req.session.message = 'Member not found!';
        req.session.messageType = 'error';
        return res.redirect('/portal/members');
      }


      const details = results[0] || null;

      const [facilityRows] = await db.query(`SELECT * FROM facilities_tbl WHERE member_id = ?`, [memberId]);
      
      const [benefitRows] = await db.query(`SELECT * FROM benefits_tbl WHERE member_id = ? LIMIT 1`, [memberId]);
      if (benefitRows.length === 1) benefits = JSON.parse(benefitRows[0].benefits);

      const [saccoRow] = await db.query(`SELECT * FROM sacco_members_tbl WHERE member_id = ? LIMIT 1`, [memberId]);
       const saccos = saccoRow[0] || null;

    res.render('portal/view-member', {
      details, facility: facilityRows, benefits, saccos
    });
  } catch (error) {
    console.error('Member details fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.post('/update-member-status/:member_id', ensureAuthenticated, ensureRole(['Admin']), portalController.updateMemberStatus);

router.post('/update-member-details', ensureAuthenticated, ensureRole(['Admin']), portalController.updateMemberProfile);

router.post('/update-member-benefits', ensureAuthenticated, ensureRole(['Admin']), portalController.updateMemberBenefits);

router.get('/export-members', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const { county, sub_county, ward, status, membershipType, startDate, endDate, ageGroup, limit, exportType = 'excel' } = req.query;

    let query = `
      SELECT 
        m.member_id, m.membership_no, m.first_name, m.middle_name, m.last_name, m.email, m.membership_type, m.role, m.status, m.reg_date, p.profile_id,
        p.phone, p.id_number, p.dob, p.gender, p.disability, p.education_level, p.citizenship, p.country, p.county, p.sub_county, p.ward, p.next_kin_name, 
        p.kin_rln, p.kin_phone, p.kin_location FROM members_tbl m
      JOIN member_profile_tbl p ON m.member_id = p.member_id WHERE 1=1
    `;

    const params = [];

    // Add filters dynamically
    if (county) {
      const countyList = county.split(',').map(c => c.trim()).filter(Boolean);
      if (countyList.length === 1) {
        query += ` AND p.county = ?`;
        params.push(countyList[0]);
      } else if (countyList.length > 1) {
        if (!(status || membershipType || ageGroup)) {
          req.session.message = "Select either a status, membership type, or age group to export multiple counties.";
          req.session.messageType = "error";
          return res.redirect('/portal/members');
        }
        query += ` AND p.county IN (${countyList.map(() => '?').join(',')})`;
        params.push(...countyList);
      }
    }

    if (sub_county) {
      query += ` AND p.sub_county = ?`;
      params.push(sub_county);
    }
    if (ward) {
      query += ` AND p.ward = ?`;
      params.push(ward);
    }
    if (status) {
      query += ` AND m.status = ?`;
      params.push(status);
    }
    if (membershipType) {
      query += ` AND m.membership_type = ?`;
      params.push(membershipType);
    }
    if (startDate && endDate) {
      query += ` AND DATE(m.reg_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(m.reg_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(m.reg_date) <= ?`;
      params.push(endDate);
    }

    // Filter by age group (example: 18-25, 26-35, etc.)
    if (ageGroup) {
      const [minAge, maxAge] = ageGroup.split('-').map(Number);
      if (!isNaN(minAge)) {
        query += ` AND TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) >= ?`;
        params.push(minAge);
      }
      if (!isNaN(maxAge)) {
        query += ` AND TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) <= ?`;
        params.push(maxAge);
      }
    }

    // Limit number of records if set
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No members found for the selected filters";
      req.session.messageType = "error";
      return res.redirect('/portal/members');
    }

    const fields = [
      'member_id', 'membership_no', 'first_name', 'middle_name', 'last_name',
      'email', 'membership_type', 'role', 'status', 'reg_date',
      'phone', 'id_number', 'dob', 'gender', 'disability', 'education_level',
      'citizenship', 'country', 'county', 'sub_county', 'ward',
      'next_kin_name', 'kin_rln', 'kin_phone', 'kin_location'
    ];

    // --- CSV EXPORT ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);
      res.header('Content-Type', 'text/csv');
      res.attachment(`members_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- EXCEL EXPORT ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        let obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Members');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`members_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }
    return res.json(rows);

  } catch (err) {
    req.session.message = err.message;
    req.session.messageType = "error";
    return res.redirect('/portal/members');
  }
});

router.get('/approval', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const search = (req.query.search || '').trim();
  const category = req.query.category || '';
  const status = req.query.status || '';
  const sortBy = req.query.sortBy || 'reg_date';


  let conditions = [];
  let params = [];

  conditions.push(`m.membership_no IS NULL`);

  if (search) {
    conditions.push(`
      (m.full_name LIKE ? OR p.phone LIKE ?)
    `);
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category) {
    conditions.push(`m.membership_type = ?`);
    params.push(category);
  }

  if (status) {
    conditions.push(`m.status = ?`);
    params.push(status);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  //  Sorting
  let orderSQL = 'm.reg_date DESC';
  if (sortBy === 'latest_date') {
    orderSQL = `m.reg_date DESC`;
  } else if (sortBy === 'old_date'){
    orderSQL = `m.reg_date ASC`;
  } 

  try {
    // 🔹 Step 1: Count total (members same WHERE conditions)
    const [countResult] = await db.execute(
      `SELECT COUNT(DISTINCT m.member_id) AS total FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // 🔹 Step 2: Fetch member_ids for this page
    const [memberIdsResult] = await db.execute(
      `SELECT m.member_id 
       FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id ${whereSQL} ORDER BY ${orderSQL} LIMIT ? OFFSET ?`, 
       [...params, perPage, offset]
    );

    const memberIds = memberIdsResult.map(r => r.member_id);
    let applications = [];

    if (memberIds.length > 0) {
      // 🔹 Step 3: Fetch details for just those IDs
      const [results] = await db.query(
        `SELECT m.member_id, m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.membership_type, m.status, m.reg_date, p.phone, p.gender,
        p.county, p.sub_county, p.ward FROM members_tbl m LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id 
        WHERE m.member_id IN (?) 
        ORDER BY ${orderSQL}`,
        [memberIds]
      );
      applications = results;
    }

    res.render('portal/approval', {
      total,
      applications,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search,
      category,
      sortBy,
      status,
      memberTypes: ['Facility In', 'Individual', 'Sacco In'],
      statusOptions: ['Pending', 'Suspended']
    });
  } catch (error) {
    console.error('Members Application fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.post('/approve-membership/:member_id', ensureAuthenticated, ensureRole(['Admin']), portalController.approveMember);

router.post('/decline-membership/:member_id', ensureAuthenticated, ensureRole(['Admin']), portalController.declineMember);

// ------------------------------------------------------------------------------------------------
// 4. Facilities OVERVIEW FILTER LOGIC AND DETAILS VIEW
// ------------------------------------------------------------------------------------------------

router.get('/facilities', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const filters = {
    search: (req.query.search || '').trim(),
    county: req.query.county,
    subcounty: req.query.subcounty,
    ward: req.query.ward,
    type: req.query.type,
    status: req.query.status,
    sortBy: req.query.sortBy || 'reg_date',
  };

  let conditions = [];
  let params = [];

  // --- SEARCH ---
  if (filters.search) {
    conditions.push(`(f.facility_name LIKE ? OR f.reg_no LIKE ? OR m.membership_no LIKE ?)`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  // --- COUNTY / SUBCOUNTY / WARD LOGIC ---
  const counties = Array.isArray(filters.county)
    ? filters.county.filter(c => c && c.trim() !== '')
    : filters.county
    ? [filters.county]
    : [];

  const multipleCounties = counties.length > 1;

  if (counties.length > 0) {
    if (multipleCounties) {
      conditions.push(`f.f_county IN (${counties.map(() => '?').join(',')})`);
      params.push(...counties);
    } else {
      conditions.push(`f.f_county = ?`);
      params.push(counties[0]);
    }
  }

  if (filters.subcounty && !multipleCounties) {
    conditions.push(`f.f_subcounty = ?`);
    params.push(filters.subcounty);
  }

  if (filters.ward && !multipleCounties) {
    conditions.push(`f.f_area = ?`);
    params.push(filters.ward);
  }

  if (filters.status) {
    conditions.push(`f.status = ?`);
    params.push(filters.status);
  }

  if (filters.type) {
    conditions.push(`f.facility_type = ?`);
    params.push(filters.type);
  }

  // --- WHERE CLAUSE ---
  const whereSQL = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // --- SORTING ---
  const sortMap = {
    beneficiaries_high: 'f.total_beneficiaries DESC',
    beneficiaries_low: 'f.total_beneficiaries ASC',
    caregivers_high: 'f.total_caregivers DESC',
    caregivers_low: 'f.total_caregivers ASC',
    reg_date: 'f.reg_date DESC',
  };
  const orderSQL = sortMap[filters.sortBy] || sortMap.reg_date;

  try {
    // --- COUNT ---
    const [countResult] = await db.execute(`SELECT COUNT(DISTINCT f.facility_id) AS total
       FROM facilities_tbl f
       LEFT JOIN members_tbl m ON f.member_id = m.member_id
       ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // --- FETCH DATA ---
    const [institutions] = await db.query(
      `SELECT f.facility_id, f.facility_name, f.facility_type, f.f_county, f.f_subcounty, f.f_area, f.reg_no, f.status, f.reg_date, f.total_beneficiaries, 
      f.total_caregivers, m.member_id, m.membership_no AS owner_membership FROM facilities_tbl f LEFT JOIN members_tbl m ON f.member_id = m.member_id
      ${whereSQL} ORDER BY ${orderSQL} LIMIT ? OFFSET ?`, [...params, perPage, offset]
    );

    // --- DROPDOWN DATA ---
    const [countiesList] = await db.query(
      `SELECT DISTINCT f_county FROM facilities_tbl WHERE f_county IS NOT NULL`
    );

    let subcounties = [];
    let wards = [];

    if (counties.length === 1) {
      [subcounties] = await db.query(
        `SELECT DISTINCT f_subcounty FROM facilities_tbl WHERE f_county = ?`,
        [counties[0]]
      );
    }

    if (filters.subcounty && !multipleCounties) {
      [wards] = await db.query(
        `SELECT DISTINCT f_area FROM facilities_tbl WHERE f_subcounty = ?`,
        [filters.subcounty]
      );
    }

    // --- RENDER PAGE ---
    res.render('portal/facilities', {
      total,
      institutions,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search: filters.search,
      county: filters.county,
      subcounty: filters.subcounty,
      ward: filters.ward,
      type: filters.type,
      status: filters.status,
      sortBy: filters.sortBy,
      typeOptions: ['Daycare', 'Home-care', 'ECD Playgroup'],
      statusOptions: ['Active', 'Inactive', 'Pending'],
      counties: countiesList.map(c => c.f_county),
      subcounties: subcounties.map(s => s.f_subcounty),
      wards: wards.map(w => w.f_area),
    });
  } catch (error) {
    console.error('Facility fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.post('/view-facility-details', ensureAuthenticated, portalController.getFacilityDetails);

router.get('/view-facility', async (req, res) => {

  if (!req.session.facilityDetails) {
    req.session.message = 'Unable to get the selected facility details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/portal/facilities');
  }

  const { memberId, facilityId } = req.session.facilityDetails;

  try {
    const [rows] = await db.execute(
      `SELECT f.facility_id, f.facility_name, f.facility_type, f.setup_type, f.facility_estab_year, f.reg_no, f.license_no, 
              f.male_b, f.female_b, f.male_b_dis, f.female_b_dis, f.male_c, f.female_c, 
              f.f_county, f.f_subcounty, f.f_area, f.status, f.reg_date, f.total_beneficiaries, f.total_caregivers,
              m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name
       FROM facilities_tbl f LEFT JOIN members_tbl m ON f.member_id = m.member_id
       WHERE f.facility_id = ? AND f.member_id = ? LIMIT 1`,
      [facilityId, memberId]
    );

    if (rows.length === 0) {
      req.session.message = 'Facility not found.';
      req.session.messageType = 'error';
      return res.redirect('/portal/facilities');
    }

    const facility = rows[0];

    res.render('portal/view-facility', { facility });

  } catch (err) {
    console.error('Error loading facility profile:', err);
    req.session.message = 'Error loading facility profile.';
    req.session.messageType = 'error';
    res.redirect('/portal/facilities');
  }
});

router.post('/update-facility-details', ensureAuthenticated, ensureRole(['Admin']), portalController.updateFacilityDetails);

router.post('/update-facility-status/:facility_id', ensureAuthenticated, ensureRole(['Admin']), portalController.updateFacilityStatus);

router.get('/export-facilities', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const {
      county,
      sub_county,
      ward,
      status,
      facilityType,
      startDate,
      endDate,
      orderBy,      
      limit,
      exportType = 'excel'
    } = req.query;

    let query = `
      SELECT 
        f.facility_id,
        f.member_id,
        m.membership_no,
        CONCAT(m.first_name, ' ', m.middle_name, ' ', m.last_name) AS member_name,
        f.facility_name,
        f.facility_type,
        f.setup_type,
        f.facility_estab_year,
        f.reg_no,
        f.license_no,
        f.male_b,
        f.female_b,
        f.male_b_dis,
        f.female_b_dis,
        f.male_c,
        f.female_c,
        f.f_county,
        f.f_subcounty,
        f.f_area AS f_ward,
        f.status,
        f.reg_date,
        f.total_beneficiaries,
        f.total_caregivers
      FROM facilities_tbl f
      JOIN members_tbl m ON f.member_id = m.member_id
      WHERE 1=1
    `;

    const params = [];

    // --- Filters ---
    if (county) {
      const countyList = county.split(',').map(c => c.trim()).filter(Boolean);
      if (countyList.length === 1) {
        query += ` AND f.f_county = ?`;
        params.push(countyList[0]);
      } else if (countyList.length > 1) {
        // Check required filters when exporting multiple counties
        if (!(status || facilityType || orderBy)) {
          req.session.message = "Select either a status, facility type, or order by to export multiple counties.";
          req.session.messageType = "error";
          return res.redirect('/portal/facilities');
        }
        query += ` AND f.f_county IN (${countyList.map(() => '?').join(',')})`;
        params.push(...countyList);
      }
    }

    if (sub_county) {
      query += ` AND f.f_subcounty = ?`;
      params.push(sub_county);
    }
    if (ward) {
      query += ` AND f.f_area = ?`;
      params.push(ward);
    }
    if (status) {
      query += ` AND f.status = ?`;
      params.push(status);
    }
    if (facilityType) {
      query += ` AND f.facility_type = ?`;
      params.push(facilityType);
    }

    if (startDate && endDate) {
      query += ` AND DATE(f.reg_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(f.reg_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(f.reg_date) <= ?`;
      params.push(endDate);
    }

    // --- Sorting ---
    if (orderBy === 'beneficiaries') {
      query += ` ORDER BY f.total_beneficiaries DESC`;
    } else if (orderBy === 'caregivers') {
      query += ` ORDER BY f.total_caregivers DESC`;
    } else {
      query += ` ORDER BY f.reg_date DESC`;
    }

    // --- Limit ---
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No facilities found for the selected filters.";
      req.session.messageType = "error";
      return res.redirect('/portal/facilities');
    }

    // --- Fields for export ---
    const fields = [
      'facility_id', 'member_id', 'membership_no', 'member_name',
      'facility_name', 'facility_type', 'setup_type', 'facility_estab_year',
      'reg_no', 'license_no', 'male_b', 'female_b', 'male_b_dis', 'female_b_dis',
      'male_c', 'female_c', 'f_county', 'f_subcounty', 'f_ward',
      'status', 'reg_date', 'total_beneficiaries', 'total_caregivers'
    ];

    // --- CSV Export ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header('Content-Type', 'text/csv');
      res.attachment(`facilities_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- Excel Export ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        const obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Facilities');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`facilities_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting facilities:', err);
    res.status(500).send('Error exporting facilities data.');
  }
});


// ------------------------------------------------------------------------------------------------
// PORTAL USERS
// ------------------------------------------------------------------------------------------------
router.get('/users', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const [users] = await db.query(`SELECT * FROM user_tbl ORDER BY create_at DESC`);
    res.render('portal/users', { users });
  } catch (err) {
    console.error(err);
    req.session.message = 'Error loading users.';
    req.session.messageType = 'error';
    res.redirect('/portal/dashboard');
  }
});

router.post('/add-users', ensureAuthenticated, ensureRole(['Admin']), portalController.addPortalUser);

router.post('/edit-user-role/:user_id', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  const { user_id } = req.params;
  const { role } = req.body;

  try {
    const [checkUser] = await db.query(
      `SELECT idNumber, status FROM user_tbl WHERE user_id = ? LIMIT 1`,
      [user_id]
    );

    if (checkUser.length === 0) {
      req.session.message = 'User not found!';
      req.session.messageType = 'error';
      return res.redirect('/portal/users');
    }

    const user = checkUser[0];

    if (user.status !== 'Active') {
      req.session.message = 'User account must be active to change permission roles!';
      req.session.messageType = 'error';
      return res.redirect('/portal/view-user');
    }

    await db.execute(`UPDATE user_tbl SET role = ? WHERE user_id = ? LIMIT 1`, [role, user_id]);

    await logActivity(req.session.userId, null, "USER_ROLE_UPDATED", `User role for ID Number ${user.idNumber} changed to ${role}.`, req);

    req.session.message = `User role updated to ${role} successfully!`;
    req.session.messageType = 'success';
    res.redirect('/portal/view-user');

  } catch (err) {
    console.error('Error updating user role:', err);
    req.session.message = 'Error updating user role.';
    req.session.messageType = 'error';
    res.redirect('/portal/users');
  }
});

router.post('/get-user-details', ensureAuthenticated, ensureRole(['Admin']), portalController.viewUserDetails);

router.get('/view-user', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {

  if (!req.session.userDetails) {
    req.session.message = 'Unable to get the selected user details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/portal/users');
  }

  const { userId } = req.session.userDetails;

  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const startDate = req.query.start || '';
  const endDate = req.query.end || '';
  const q = req.query.q || '';
  const exportType = req.query.exportType || '';

  try {
    // Fetch user info
    const [userRows] = await db.execute(
      `SELECT user_id, fullname, email, role, status FROM user_tbl WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      req.session.message = 'User not found.';
      req.session.messageType = 'error';
      return res.redirect('/portal/users');
    }

    const user = userRows[0];

    // Build conditions for filtering
    const conditions = [`user_id = ?`];
    const params = [userId];

    if (startDate && endDate) {
      conditions.push(`DATE(created_at) BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push(`DATE(created_at) >= ?`);
      params.push(startDate);
    } else if (endDate) {
      conditions.push(`DATE(created_at) <= ?`);
      params.push(endDate);
    }

    if (q) {
      conditions.push(`(action LIKE ? OR description LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSQL = `WHERE ${conditions.join(' AND ')}`;

    // Count total logs
    const [countResult] = await db.execute(
      `SELECT COUNT(*) AS total FROM activity_logs_tbl ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    // Fetch paginated logs
    const [logs] = await db.execute(
      `SELECT id, user_id, member_id, action, description, ip_address, user_agent, created_at
       FROM activity_logs_tbl
       ${whereSQL}
       ORDER BY created_at DESC
       OFFSET ? LIMIT ?`,
      [...params, Number(offset), Number(perPage)]
    );

    // Export logs
    if (exportType === 'csv' || exportType === 'excel') {
      const fields = [
        'id', 'user_id', 'member_id', 'action',
        'description', 'ip_address', 'user_agent', 'created_at'
      ];

      const fieldNames = fields.map(f => f.toUpperCase());

      if (exportType === 'csv') {
        const { Parser } = require('json2csv');
        const parser = new Parser({ fields, header: fieldNames });
        const csv = parser.parse(logs);

        res.header('Content-Type', 'text/csv');
        res.attachment(`user_logs_${userId}.csv`);
        return res.send(csv);
      }

      if (exportType === 'excel') {
        const xlsx = require('xlsx');
        const data = logs.map(log => {
          let obj = {};
          fields.forEach(f => obj[f.toUpperCase()] = log[f]);
          return obj;
        });

        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Logs');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment(`user_logs_${userId}.xlsx`);
        return res.send(buffer);
      }
    }

    res.render('portal/view-user', {
      user,
      logs,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPage,
      total,
      startDate,
      endDate,
      q,
      queryString: (startDate || endDate)
        ? `&start=${startDate}&end=${endDate}`
        : ''
    });

  } catch (err) {
    console.error('Error loading user logs:', err);
    req.session.message = 'Error loading user logs.';
    req.session.messageType = 'error';
    res.redirect('/portal/users');
  }
});

router.post('/edit-user-status/:user_id', ensureAuthenticated, ensureRole(['Admin']), portalController.editUserStatus);

router.post('/reset-user-account/:user_id', ensureAuthenticated, ensureRole(['Admin']), portalController.resetUserAccount);

router.get('/profile', ensureAuthenticated, portalController.viewProfile);

router.post('/user-change-password', ensureAuthenticated, portalController.userChangePassword);

// ------------------------------------------------------------------------------------------------
// SACCO MEMBERS
// ------------------------------------------------------------------------------------------------

router.post('/add-sacco-member', ensureAuthenticated, ensureRole(['Admin', 'Data Clerk']), portalController.addSaccoMember);

router.get('/sacco-member', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const search = (req.query.search || '').trim();
  const county = req.query.county || '';
  const subcounty = req.query.subcounty || '';
  const ward = req.query.ward || '';
  const status = req.query.status || '';

  let conditions = [];
  let params = [];

  // conditions.push(`m.membership_type = 'Sacco In'`);

  let useExactMembership = search && /^[A-Za-z0-9\-_]+$/.test(search);
  if (search) {
    if (useExactMembership) {
      conditions.push(`m.membership_no = ?`);
      params.push(search);
    } else {
      conditions.push(`
        (
          CONCAT(m.first_name, ' ', m.last_name) LIKE ?
          OR p.phone LIKE ?
          OR p.id_number LIKE ?
        )
      `);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
  }

  if (county) {
    conditions.push(`p.county = ?`);
    params.push(county);
  }

  if (subcounty) {
    conditions.push(`p.sub_county = ?`);
    params.push(subcounty);
  }

  if (ward) {
    conditions.push(`p.ward = ?`);
    params.push(ward);
  }

  if (status) {
    conditions.push(`s.status = ?`);
    params.push(status);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) AS total FROM sacco_members_tbl s INNER JOIN members_tbl m ON s.member_id = m.member_id
      LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id
      ${whereSQL}
      `,
      params
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const [results] = await db.execute(
      `SELECT s.sacco_member_id, s.member_id, s.membership_no, s.shares, s.savings, s.loan_balance, s.status AS sacco_status, s.join_date, s.notes, 
      s.created_at, s.updated_at, CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.email, m.membership_type, p.phone, p.id_number, p.gender, p.county, 
      p.sub_county, p.ward
      FROM sacco_members_tbl s
      INNER JOIN members_tbl m ON s.member_id = m.member_id
      LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id
      ${whereSQL}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, perPage, offset]
    );

    const [counties] = await db.query(`SELECT DISTINCT county FROM member_profile_tbl WHERE county IS NOT NULL`);
    let subcounties = [];
    let wards = [];

    if (county) {
      [subcounties] = await db.query(`SELECT DISTINCT sub_county FROM member_profile_tbl WHERE county = ?`, [county]);
    }
    if (subcounty) {
      [wards] = await db.query(`SELECT DISTINCT ward FROM member_profile_tbl WHERE sub_county = ?`, [subcounty]);
    }

    res.render('portal/sacco-member', {
      total,
      members: results,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search,
      county,
      subcounty,
      ward,
      status,
      counties: counties.map(c => c.county),
      subcounties: subcounties.map(s => s.sub_county),
      wards: wards.map(w => w.ward),
      statusOptions: ['Active', 'Inactive', 'Pending', 'Suspended']
    });

  } catch (error) {
    console.error('Sacco Members fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.post('/update-member-sacco-status/:sacco_member_id', ensureAuthenticated, ensureRole(['Admin']), portalController.editSaccoStatus);

router.get('/contributions', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;
  const search = (req.query.search || '').trim(); // reference_no search
  const contributionType = req.query.contributionType || '';
  const paymentMethod = req.query.paymentMethod || '';
  const sortBy = req.query.sortBy || 'contribution_date'; // or 'amount'

  let conditions = [];
  let params = [];

  if (search) {
    conditions.push(`c.reference_no LIKE ?`);
    params.push(`%${search}%`);
  }

  if (contributionType) {
    conditions.push(`c.contribution_type = ?`);
    params.push(contributionType);
  }

  if (paymentMethod) {
    conditions.push(`c.payment_method = ?`);
    params.push(paymentMethod);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderSQL = 'c.contribution_date DESC';
  if (sortBy === 'amount_high') {
    orderSQL = `c.amount DESC`;
  } else if (sortBy === 'amount_low'){
    orderSQL = 'c.amount ASC';
  }

  try {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) AS total 
       FROM contributions_tbl c
       INNER JOIN members_tbl m ON c.member_id = m.member_id
       ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const [results] = await db.execute(
      `SELECT 
          c.contribution_id, c.contribution_type, c.amount, c.payment_method, c.reference_no, c.contribution_date, CONCAT(m.first_name, ' ', m.last_name) AS full_name, 
          c.status, m.membership_no
          FROM contributions_tbl c INNER JOIN members_tbl m ON c.member_id = m.member_id
        ${whereSQL}
        ORDER BY ${orderSQL}
        LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
    );

    const [types] = await db.query(`SELECT DISTINCT contribution_type FROM contributions_tbl WHERE contribution_type IS NOT NULL`);
    const [methods] = await db.query(`SELECT DISTINCT payment_method FROM contributions_tbl WHERE payment_method IS NOT NULL`);

    res.render('portal/contributions', {
      total,
      contributions: results,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search,
      contributionType,
      paymentMethod,
      sortBy,
      types: types.map(t => t.contribution_type),
      methods: methods.map(m => m.payment_method)
    });
  } catch (error) {
    console.error('Contributions fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.post('/view-sacco', ensureAuthenticated, ensureRole(['Admin', 'Data Clerk']), portalController.getSaccoDetails);

router.get('/sacco-details', ensureAuthenticated, async (req, res) => {

  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const startDate = req.query.start || '';
  const endDate = req.query.end || '';
  const loanType = req.query.loanType || '';
  const exportType = req.query.exportType || '';
  
  const { member_id, sacco_id } = req.session.saccoDetails;

  if (!member_id || !sacco_id) {
    req.session.message = 'Sacco member not found!';
    req.session.messageType = 'error';
    return res.redirect('/portal/sacco-member');
  }

  try {

    const conditions = [`sacco_member_id = ?`];
    const params = [sacco_id];

    if (startDate && endDate) {
      conditions.push(`DATE(created_at) BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push(`DATE(created_at) >= ?`);
      params.push(startDate);
    } else if (endDate) {
      conditions.push(`DATE(created_at) <= ?`);
      params.push(endDate);
    }

    if (loanType) {
      conditions.push(`(loan_type = ?)`);
      params.push(loanType);
    }

    const whereSQL = `WHERE ${conditions.join(' AND ')}`;

    const [countResult] = await db.execute(
      `SELECT COUNT(*) AS total FROM loans_tbl ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

      const [results] = await db.query(
        `SELECT s.sacco_member_id, s.member_id, s.membership_no, s.shares, s.savings, s.loan_balance, s.status AS sacco_status, s.join_date, s.notes, 
        s.created_at, s.updated_at, CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.email, m.membership_type, p.phone, p.id_number, p.gender, p.disability,
        p.dob,  p.education_level, p.next_kin_name, p.kin_rln, p.kin_phone, p.kin_location, p.county, 
        p.sub_county, p.ward FROM sacco_members_tbl s INNER JOIN members_tbl m ON s.member_id = m.member_id
        LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id WHERE s.sacco_member_id = ? AND s.member_id = ? LIMIT 1`, [sacco_id, member_id]
      );

      if (results.length === 0) {
        req.session.message = 'Sacco member not found!';
        req.session.messageType = 'error';
        return res.redirect('/portal/sacco-member');
      }


      const details = results[0] || null;

      const [loanRows] = await db.query(`SELECT * FROM loans_tbl ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset]);

      const [rowTypes] = await db.query(`SELECT * FROM loan_types_tbl`);
      
    res.render('portal/sacco-details', {
      details, 
      loans: loanRows,
      loanTypes: rowTypes,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPage,
      total,
      startDate,
      endDate,
      loanType,
      queryString: (startDate || endDate)
        ? `&start=${startDate}&end=${endDate}`
        : ''
    });
  } catch (error) {
    console.error('Member sacco details fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/loan-types', async (req, res) => {
  try {
    const [loanTypes] = await db.query('SELECT * FROM loan_types_tbl ORDER BY loan_name ASC');
    res.json(loanTypes);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post('/loans-issue', ensureAuthenticated, ensureRole(['Admin']), portalController.issueLoan);

router.get('/loans', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const search = (req.query.search || '').trim();
  const loanType = req.query.loanType || '';
  const loanStatus = req.query.status || '';
  const sortBy = req.query.sortBy || 'due_date';
  const sortOrder = req.query.order === 'asc' ? 'ASC' : 'DESC';

  let conditions = [];
  let params = [];

  if (search) {
    if (/^[A-Za-z0-9\-_]+$/.test(search)) {
      conditions.push(`s.membership_no = ?`);
      params.push(search);
    } else {
      conditions.push(`
        (
          CONCAT(m.first_name, ' ', m.last_name) LIKE ?
          OR m.email LIKE ?
        )
      `);
      params.push(`%${search}%`, `%${search}%`);
    }
  }

  if (loanType) {
    conditions.push(`l.loan_type = ?`);
    params.push(loanType);
  }

  if (loanStatus) {
    conditions.push(`l.status = ?`);
    params.push(loanStatus);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const validSortColumns = {
    amount: 'l.principal',
    due_date: 'l.due_date'
  };
  const sortColumn = validSortColumns[sortBy] || 'l.due_date';

  try {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM loans_tbl l
       INNER JOIN sacco_members_tbl s ON l.sacco_member_id = s.sacco_member_id
       INNER JOIN members_tbl m ON s.member_id = m.member_id
       ${whereSQL}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const [summaryResult] = await db.execute(
      `SELECT 
          COALESCE(SUM(l.principal), 0) AS total_principal,
          COALESCE(SUM(l.interest_amount), 0) AS total_interest,
          COALESCE(SUM(l.total_repayment), 0) AS total_repayment,
          COALESCE(SUM(l.balance), 0) AS total_balance
       FROM loans_tbl l
       INNER JOIN sacco_members_tbl s ON l.sacco_member_id = s.sacco_member_id
       INNER JOIN members_tbl m ON s.member_id = m.member_id
       ${whereSQL}`,
      params
    );

    const summary = summaryResult[0];

    const [results] = await db.execute(
      `SELECT 
          l.loan_id, l.loan_type, l.principal, l.interest_rate, l.interest_amount,
          l.total_repayment, l.repayment_period, l.repayment_source,
          l.balance, l.status, l.issue_date, l.due_date, 
          s.sacco_member_id, s.membership_no,
          CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.email
       FROM loans_tbl l
       INNER JOIN sacco_members_tbl s ON l.sacco_member_id = s.sacco_member_id
       INNER JOIN members_tbl m ON s.member_id = m.member_id
       ${whereSQL}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const today = new Date();
    results.forEach(result => {
      const due = new Date(result.due_date);
      result.isOverdue = due < today && result.status !== 'Closed';
    });

    const [types] = await db.query(`SELECT DISTINCT loan_name FROM loan_types_tbl WHERE loan_name IS NOT NULL`);

    res.render('portal/loans', {
      total,
      loans: results,
      summary,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search,
      loanType,
      loanStatus,
      sortBy,
      sortOrder,
      types: types.map(t => t.loan_name),
      statusOptions: ['Pending', 'Active', 'Closed', 'Defaulted']
    });
  } catch (error) {
    console.error('Loans fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/api/loans/applied/:sacco_id', async (req, res) => {
  try {
    const saccoId = req.params.sacco_id;
    const [appliedLoans] = await db.query(
      `SELECT loan_id, balance, loan_type, status FROM loans_tbl WHERE sacco_member_id = ? AND status IN ('Active', 'Defaulted')`,
      [saccoId]
    );
    res.json(appliedLoans);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post('/add-contributions', ensureAuthenticated, ensureRole(['Admin']), portalController.addContribution);

router.get('/export-sacco-members', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const {
      county, sub_county, ward, status, startDate, endDate, orderBy, limit, exportType = 'excel' } = req.query;

    let query = `
      SELECT 
        s.sacco_member_id, s.member_id,
        s.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS member_name, m.email, p.phone, p.id_number, p.gender,
        p.county, p.sub_county, p.ward, s.shares, s.savings, s.loan_balance, s.status AS sacco_status, s.join_date, s.notes, s.created_at, s.updated_at
      FROM sacco_members_tbl s INNER JOIN members_tbl m ON s.member_id = m.member_id
      LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id WHERE 1=1`;

    const params = [];

    // --- Filters ---
    if (county) {
      query += ` AND p.county = ?`;
      params.push(county);
    }
    if (sub_county) {
      query += ` AND p.sub_county = ?`;
      params.push(sub_county);
    }
    if (ward) {
      query += ` AND p.ward = ?`;
      params.push(ward);
    }
    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    if (startDate && endDate) {
      query += ` AND DATE(s.join_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(s.join_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(s.join_date) <= ?`;
      params.push(endDate);
    }

    // --- Sorting ---
    if (orderBy === 'shares') {
      query += ` ORDER BY s.shares DESC`;
    } else if (orderBy === 'savings') {
      query += ` ORDER BY s.savings DESC`;
    } else if (orderBy === 'loan_balance') {
      query += ` ORDER BY s.loan_balance DESC`;
    } else {
      query += ` ORDER BY s.join_date DESC`;
    }

    // --- Limit ---
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No SACCO members found for the selected filters.";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-member');
    }

    // --- Fields for export ---
    const fields = [
      'sacco_member_id', 'member_id', 'membership_no', 'member_name',
      'email', 'phone', 'id_number', 'gender', 'county', 'sub_county', 'ward',
      'shares', 'savings', 'loan_balance', 'sacco_status',
      'join_date', 'notes', 'created_at', 'updated_at'
    ];

    // --- CSV Export ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header('Content-Type', 'text/csv');
      res.attachment(`sacco_members_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- Excel Export ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        const obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'SaccoMembers');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`sacco_members_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting SACCO members:', err);
    res.status(500).send('Error exporting SACCO member data.');
  }
});

router.get('/export-contributions', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const {
      search,
      contributionType,
      paymentMethod,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy,       // contribution_date, amount_high, amount_low
      limit,
      exportType = 'excel'
    } = req.query;

    let query = `
      SELECT 
        c.contribution_id,
        m.membership_no,
        CONCAT(m.first_name, ' ', m.last_name) AS full_name,
        c.contribution_type,
        c.amount,
        c.payment_method,
        c.reference_no,
        c.status,
        c.contribution_date,
        c.created_at,
        c.updated_at
      FROM contributions_tbl c
      INNER JOIN members_tbl m ON c.member_id = m.member_id
      WHERE 1=1
    `;

    const params = [];

    // --- Filters ---
    if (search) {
      query += ` AND c.reference_no LIKE ?`;
      params.push(`%${search}%`);
    }
    if (contributionType) {
      query += ` AND c.contribution_type = ?`;
      params.push(contributionType);
    }
    if (paymentMethod) {
      query += ` AND c.payment_method = ?`;
      params.push(paymentMethod);
    }
    if (minAmount && !isNaN(minAmount)) {
      query += ` AND c.amount >= ?`;
      params.push(Number(minAmount));
    }
    if (maxAmount && !isNaN(maxAmount)) {
      query += ` AND c.amount <= ?`;
      params.push(Number(maxAmount));
    }
    if (startDate && endDate) {
      query += ` AND DATE(c.contribution_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(c.contribution_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(c.contribution_date) <= ?`;
      params.push(endDate);
    }

    // --- Sorting ---
    if (sortBy === 'amount_high') {
      query += ` ORDER BY c.amount DESC`;
    } else if (sortBy === 'amount_low') {
      query += ` ORDER BY c.amount ASC`;
    } else {
      query += ` ORDER BY c.contribution_date DESC`;
    }

    // --- Limit ---
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No contributions found for the selected filters.";
      req.session.messageType = "error";
      return res.redirect('/portal/contributions');
    }

    // --- Fields for export ---
    const fields = [
      'contribution_id', 'membership_no', 'full_name',
      'contribution_type', 'amount', 'payment_method',
      'reference_no', 'status', 'contribution_date',
      'created_at', 'updated_at'
    ];

    // --- CSV Export ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header('Content-Type', 'text/csv');
      res.attachment(`contributions_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- Excel Export ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        const obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Contributions');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`contributions_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting contributions:', err);
    res.status(500).send('Error exporting contributions data.');
  }
});

router.get('/export-loans', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const {
      loanType, status, startDate, endDate, minAmount, maxAmount, sortBy, limit, exportType = 'excel' } = req.query;

    let query = `
      SELECT 
        l.loan_id, s.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name, l.loan_type, l.principal AS amount, l.interest_rate,
        l.interest_amount, l.total_repayment, l.balance, l.repayment_period, l.repayment_source, l.status, l.issue_date, l.due_date,
        l.created_at, l.updated_at FROM loans_tbl l INNER JOIN sacco_members_tbl s ON l.sacco_member_id = s.sacco_member_id
      INNER JOIN members_tbl m ON s.member_id = m.member_id WHERE 1=1`;

    const params = [];

    // --- Filters ---
    if (loanType) {
      query += ` AND l.loan_type = ?`;
      params.push(loanType);
    }
    if (status) {
      query += ` AND l.status = ?`;
      params.push(status);
    }
    if (minAmount && !isNaN(minAmount)) {
      query += ` AND l.principal >= ?`;
      params.push(Number(minAmount));
    }
    if (maxAmount && !isNaN(maxAmount)) {
      query += ` AND l.principal <= ?`;
      params.push(Number(maxAmount));
    }
    if (startDate && endDate) {
      query += ` AND DATE(l.issue_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(l.issue_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(l.issue_date) <= ?`;
      params.push(endDate);
    }

    // --- Sorting ---
    if (sortBy === 'amount_high') {
      query += ` ORDER BY l.principal DESC`;
    } else if (sortBy === 'amount_low') {
      query += ` ORDER BY l.principal ASC`;
    } else if (sortBy === 'due_date') {
      query += ` ORDER BY l.due_date DESC`;
    } else {
      query += ` ORDER BY l.issue_date DESC`;
    }

    // --- Limit ---
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No loans found for the selected filters.";
      req.session.messageType = "error";
      return res.redirect('/portal/loans');
    }

    // --- Fields for export ---
    const fields = [
      'loan_id', 'membership_no', 'full_name', 'loan_type',
      'amount', 'interest_rate', 'interest_amount',
      'total_repayment', 'balance', 'repayment_period',
      'repayment_source', 'status', 'issue_date', 'due_date',
      'created_at', 'updated_at'
    ];

    // --- CSV Export ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header('Content-Type', 'text/csv');
      res.attachment(`loans_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- Excel Export ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        const obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Loans');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`loans_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting loans:', err);
    res.status(500).send('Error exporting loans data.');
  }
});

// ------------------------------------------------------------------------------------------------
// COLLECT DATA
// ------------------------------------------------------------------------------------------------

router.get('/survey', ensureAuthenticated, async (req, res) => {
  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const search = (req.query.search || '').trim();
  const county = req.query.county || '';
  const subcounty = req.query.subcounty || '';
  const ward = req.query.ward || '';
  const gender = req.query.gender || '';
  const education = req.query.education || '';
  const status = req.query.status || '';
  const sortBy = req.query.sortBy || 'created_at'; // Sorting field

  let conditions = [];
  let params = [];

  if (search) {
    conditions.push(`
      (enumerator_name LIKE ? OR facility_name LIKE ? OR provider_name LIKE ? OR phone_number LIKE ?)
    `);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (county) {
    conditions.push(`county_name = ?`);
    params.push(county);
  }

  if (subcounty) {
    conditions.push(`sub_county_name = ?`);
    params.push(subcounty);
  }

  if (ward) {
    conditions.push(`ward_name = ?`);
    params.push(ward);
  }

  if (gender) {
    conditions.push(`gender = ?`);
    params.push(gender);
  }

  if (education) {
    conditions.push(`education_level = ?`);
    params.push(education);
  }

  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  
  let orderSQL = 'created_at DESC';
  if (sortBy === 'year_oldest') orderSQL = 'year_established ASC';
  if (sortBy === 'year_newest') orderSQL = 'year_established DESC';
  if (sortBy === 'children_high') orderSQL = 'total_children DESC';
  if (sortBy === 'children_low') orderSQL = 'total_children ASC';

  try {
  
    const [countResult] = await db.execute(`SELECT COUNT(*) AS total FROM childcare_survey_tbl ${whereSQL}`, params);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / perPage);

    const [surveys] = await db.query(`
      SELECT survey_id, county_name, sub_county_name, ward_name, enumerator_name, facility_name, 
      facility_classification, year_established, total_children, total_workers, gender, education_level, 
      received_training, received_certificate, interested_in_finance, worker_category, provider_name, phone_number, status, created_at
      FROM childcare_survey_tbl
      ${whereSQL}
      ORDER BY ${orderSQL}
      LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const [counties] = await db.query(`SELECT DISTINCT county_name FROM childcare_survey_tbl WHERE county_name IS NOT NULL`);
    let subcounties = [];
    let wards = [];

    if (county) {
      [subcounties] = await db.query(`SELECT DISTINCT sub_county_name FROM childcare_survey_tbl WHERE county_name = ?`, [county]);
    }
    if (subcounty) {
      [wards] = await db.query(`SELECT DISTINCT ward_name FROM childcare_survey_tbl WHERE sub_county_name = ?`, [subcounty]);
    }

    const [educationLevels] = await db.query(`SELECT DISTINCT education_level FROM childcare_survey_tbl WHERE education_level IS NOT NULL`);
    const [statuses] = await db.query(`SELECT DISTINCT status FROM childcare_survey_tbl WHERE status IS NOT NULL`);

    res.render('portal/survey', {
      total,
      surveys,
      currentPage: page,
      totalPages,
      paginationRange: getPaginationRange(page, totalPages),
      perPageOptions,
      perPage,
      search,
      county,
      subcounty,
      ward,
      gender,
      education,
      status,
      sortBy,
      counties: counties.map(c => c.county_name),
      subcounties: subcounties.map(s => s.sub_county_name),
      wards: wards.map(w => w.ward_name),
      educationLevels: educationLevels.map(e => e.education_level),
      statuses: statuses.map(s => s.status),
      genderOptions: ['Male', 'Female'],
      sortOptions: [
        { label: 'Newest Year', value: 'year_newest' },
        { label: 'Oldest Year', value: 'year_oldest' },
        { label: 'Children (High-Low)', value: 'children_high' },
        { label: 'Children (Low-High)', value: 'children_low' }
      ]
    });

  } catch (error) {
    console.error('Survey fetch error:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/collect-data', async (req, res) => {
  if (!req.session.userId) {
      req.session.message = "Unauthorized data collection";
      req.session.messageType = "error";
      return res.redirect('/auth/login');
  }

  try {

    const [row] = await db.query(`SELECT fullname FROM user_tbl WHERE user_id = ? LIMIT 1`, [req.session.userId]);

    const enumerator = row[0] || {};
    
    res.render('portal/collect-data', { enumerator});
  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/dashboard');
  }
});

router.post('/save-survey-data', ensureAuthenticated, portalController.addDataCollect);

router.get('/export-survey', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const {
      county_name,
      sub_county_name,
      ward_name,
      status,
      worker_category,
      education_level,
      startDate,
      endDate,
      limit,
      exportType = 'excel'
    } = req.query;

    let query = `
      SELECT 
        survey_id, county_name, sub_county_name, ward_name,
        enumerator_name, id_number, worker_category, gender, age, education_level,
        received_training, received_certificate, facility_name, facility_classification,
        geo_location, year_established, total_children, girls, boys, age_under6,
        age_6_12, age_12_24, age_24_36, age_36_plus, children_with_disabilities,
        boys_with_disabilities, girls_with_disabilities, total_workers, female_workers,
        male_workers, workers_with_disabilities, member_institutions, loan_institutions,
        interested_in_finance, provider_name, phone_number, status, created_at
      FROM childcare_survey_tbl
      WHERE 1=1
    `;
    const params = [];

    if (county_name) {
      query += ` AND county_name = ?`;
      params.push(county_name);
    }
    if (sub_county_name) {
      query += ` AND sub_county_name = ?`;
      params.push(sub_county_name);
    }
    if (ward_name) {
      query += ` AND ward_name = ?`;
      params.push(ward_name);
    }
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (worker_category) {
      query += ` AND worker_category = ?`;
      params.push(worker_category);
    }
    if (education_level) {
      query += ` AND education_level = ?`;
      params.push(education_level);
    }
    if (startDate && endDate) {
      query += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(created_at) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(created_at) <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY created_at DESC`;
    if (limit && !isNaN(limit)) {
      query += ` LIMIT ?`;
      params.push(Number(limit));
    }

    const [rows] = await db.execute(query, params);

    if (!rows.length) {
      req.session.message = "No survey records found for the selected filters.";
      req.session.messageType = "error";
      return res.redirect('/portal/survey');
    }

    const fields = Object.keys(rows[0] || {});

    // --- CSV Export ---
    if (exportType === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header('Content-Type', 'text/csv');
      res.attachment(`survey_export_${Date.now()}.csv`);
      return res.send(csv);
    }

    // --- Excel Export ---
    if (exportType === 'excel') {
      const xlsx = require('xlsx');
      const data = rows.map(r => {
        const obj = {};
        fields.forEach(f => {
          obj[f.toUpperCase()] = r[f];
        });
        return obj;
      });

      const worksheet = xlsx.utils.json_to_sheet(data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Survey');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`survey_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting survey:', err);
    res.status(500).send('Error exporting survey data.');
  }
});

router.post('/view-survey-details', ensureAuthenticated, portalController.getSurveyDetails);

router.get('/survey-details', async (req, res) => {

  if (!req.session.userId) return res.redirect('/auth/login');
  if (!req.session.surveyDetails) return res.redirect('/portal/survey');

  const details = req.session.surveyDetails;
  res.render('portal/survey-details', { details });
});

router.post('/edit-survey-status/:survey_id', ensureAuthenticated, ensureRole(['Admin']), portalController.editSurveyStatus);

router.post('/get-edit-survey-details/:survey_id', ensureAuthenticated, ensureRole(['Admin']), portalController.getEditSurveyDetails);

router.get('/edit-survey', async (req, res) => {

  if (!req.session.userId) return res.redirect('/auth/login');

  if (!req.session.surveyEdits) return res.redirect('/portal/survey');

  const edits = req.session.surveyEdits;
  
  res.render('portal/edit-survey', { edits });
});

router.post('/update-survey-data', ensureAuthenticated, ensureRole(['Admin']), portalController.updateSurveyData);


router.post("/import-survey", upload.single("excelFile"), portalController.importExcel);

// -------------------------------------------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------------------------------------------

router.get('/settings', ensureAuthenticated, ensureRole(['Admin']), async (req, res) => {
  try {
    const [generalRows] = await db.query('SELECT * FROM settings_tbl LIMIT 1');

    const [loanRows] = await db.query("SELECT * FROM loan_types_tbl ORDER BY loan_type_id DESC");
    
    res.render('portal/settings', { settings: generalRows[0] || {}, loanTypes: loanRows || {} });
  } catch (error) {
    console.error(error);
    res.render('portal/settings', { settings: {}, loanType: {} });
  }
});

router.post('/save-settings', ensureAuthenticated, ensureRole(['Admin']), portalController.saveSettingsDetails);

router.post('/add-loan-type', ensureAuthenticated, ensureRole(['Admin']), portalController.addLoanType);

router.post('/loan-types-update', ensureAuthenticated, ensureRole(['Admin']), portalController.updateLoanType);



// -------------------------------------------------------------------------------------------------
// PORTAL DYNAMIC ROUTES
// 1. Allowed pages 
// 2. allowed users and roles 
// -------------------------------------------------------------------------------------------------

// allowed pages and roles
const pageAccessMap = {
  'dashboard': ['Admin', 'Champion', 'Data Clerk', 'Viewer'],
  'members': ['Admin', 'Champion', 'Data Clerk', 'Viewer'],
  'add-member': ['Admin', 'Data Clerk', 'Champion'],
  'draft': ['Admin', 'Data Clerk', 'Champion'],
  'view-member': ['Admin', 'Data Clerk'],
  'approval': ['Admin'],
  'beneficiaries': ['Admin', 'Data Clerk'],
  'add-beneficiary': ['Admin', 'Data Clerk'], 
  'facilities': ['Admin', 'Data Clerk'],
  'view-facility': ['Admin', 'Data Clerk'],
  'add-facility': ['Admin', 'Data Clerk'],
  'caregiver': ['Admin', 'Data Clerk'],
  'add-caregiver': ['Admin', 'Data Clerk'],
  'contributions': ['Admin', 'Data Clerk'],
  'loans': ['Admin', 'Data Clerk'],
  'sacco-member': ['Admin', 'Data Clerk'],
  'sacco-details': ['Admin', 'Data Clerk'],
  'profile': ['Admin', 'Data Clerk','Viewer', 'Champion'],
  'settings': ['Admin'],
  'details': ['Admin'],
  'users': ['Admin'],
  'analysis': ['Admin', 'Data Clerk', 'Viewer'],
  'survey': ['Admin', 'Data Clerk', 'Viewer'],
  'survey-details': ['Admin', 'Data Clerk'],
  'collect-data': ['Admin', 'Data Clerk', 'Champion'],
  'edit-survey': ['Admin'],
  'reports': ['Admin'],
  'view-user': ['Admin'],
  'help': ['Admin', 'Champion', 'Data Clerk', 'Viewer']
};

router.get('/:page', ensureAuthenticated, async (req, res) => {
  try {
    const page = req.params.page;
    const userRole = req.session.user_role;
    const userId = req.session.userId;

    // Validate the page format (letters, numbers, underscore, dash)
    if (!/^[a-zA-Z0-9_-]+$/.test(page)) {
      req.session.message = 'Invalid page name format.';
      req.session.messageType = 'error';
      return res.redirect('/portal/dashboard');
    }

    // Check allowed map
    if (!pageAccessMap[page]) {
      req.session.message = 'This page does not exist or access is restricted.';
      req.session.messageType = 'error';
      return res.redirect('/portal/dashboard');
    }

    // role is allowed
    const allowedRoles = pageAccessMap[page];
    if (!allowedRoles.includes(userRole)) {
      if (logActivity) {
        await logActivity(userId, null, 'ACCESS_DENIED', `Unauthorized access attempt to ${page}`, req);
      }

      req.session.message = 'Access denied. You do not have permission to view this page.';
      req.session.messageType = 'error';
      return res.redirect('/portal/dashboard');
    }

    // Render the page safely
    res.render(`portal/${page}`, {
      title: page
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      session: req.session,
    });

  } catch (err) {
    console.error('Error rendering portal page:', err);
    req.session.message = 'An unexpected error occurred.';
    req.session.messageType = 'error';
    res.redirect('/portal/dashboard');
  }
});


module.exports = router;
