const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const db = require('../config/db');
const memberController = require('../controllers/memberController');
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

// ----------------------------------------------------------------------------------------------
// MEMBER DASHBOARD
// ----------------------------------------------------------------------------------------------

router.get('/my-dashboard', ensureAuthenticated, async (req, res) => {

  if (!req.session.userMember) {
    req.session.destroy(() => res.redirect('/auth/login'));
    return;
  }

  try {
    // --------------------------------------------------------------------------------------
    // MEMBER STATS
    // --------------------------------------------------------------------------------------
    const memberId = req.session.userMember;

    const [memberProfile] = await db.query('SELECT * FROM member_profile_tbl WHERE member_id = ? LIMIT 1',[memberId]);

    if (!memberProfile || !memberProfile[0]) {
      req.session.message = "Profile not found. Please complete your profile details.";
      req.session.messageType = "error";
      return res.redirect('/member/profile-details');
    }

    const [benefits] = await db.query(
      'SELECT COUNT(*) AS total_benefits FROM benefits_tbl WHERE member_id = ?',
      [memberId]
    );

    if (benefits[0].total_benefits === 0) {
      req.session.message = "Profile incomplete. Please complete your profile details.";
      req.session.messageType = "error";
      return res.redirect('/member/profile-details');
    }

    const [membership] = await db.query(`SELECT * FROM members_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

    const membershipDetails = membership[0];

    let warning = null;
    let hasFacility = false;
    let hasSacco = false;
    let facility = {};
    let sacco = {};
    let contribution = {};

    if (membershipDetails.status === 'Active') {

      // Check if membership fee paid
      const [contrib] = await db.query(`SELECT COUNT(*) AS paid_fee FROM contributions_tbl WHERE member_id = ? AND contribution_type = 'Membership Fee'
           AND status = 'Completed'`,[memberId]
      );

      // Fetch facility stats
      const [rows] = await db.query(
        `SELECT member_id, COUNT(facility_id) AS total_facilities, COALESCE(SUM(male_b), 0) AS total_boys,
        COALESCE(SUM(female_b), 0) AS total_girls,
        COALESCE(SUM(male_c), 0) AS male_caregivers,
        COALESCE(SUM(female_c), 0) AS female_caregivers,
        COALESCE(SUM(total_beneficiaries), 0) AS total_beneficiaries,
        COALESCE(SUM(total_caregivers), 0) AS total_caregivers 
        FROM facilities_tbl WHERE member_id = ? GROUP BY member_id`, [memberId]);

      // Sacco details
      const [saccoRow] = await db.query(`SELECT * FROM sacco_members_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

      // Fetch contributions
      const [contributionRow] = await db.query(`
        SELECT member_id,
        COALESCE(SUM(CASE WHEN contribution_type = 'Membership Fee' THEN amount END), 0) AS membership_fee,
        COALESCE(SUM(CASE WHEN contribution_type = 'Savings' THEN amount END), 0) AS my_savings,
        COALESCE(SUM(CASE WHEN contribution_type = 'Shares' THEN amount END), 0) AS my_shares,
        COALESCE(SUM(CASE WHEN contribution_type = 'Loan Repayment' THEN amount END), 0) AS loan_repayment,
        COALESCE(SUM(CASE WHEN contribution_type = 'Penalty' THEN amount END), 0) AS penalty FROM contributions_tbl
        WHERE member_id = ? AND status = 'Completed' GROUP BY member_id`, [memberId]);

      hasFacility = rows.length > 0;
      facility = hasFacility ? rows[0] : {};

      hasSacco = saccoRow.length > 0;
      sacco = hasSacco ? saccoRow[0] : {};

      contribution = contributionRow.length > 0;

      if (contrib[0].paid_fee === 0 && membershipDetails.status === 'Active') {
        warning = 'You have not paid your membership fee. Please make your first payment.';
      }
    }

    if (membershipDetails.status === 'Pending') {
        warning = 'Your profile is currently under review. Please check back later or contact support for assistance.';
    }

    if (membershipDetails.status === 'Draft') {
      req.session.message = "Profile incomplete. Please complete your profile details.";
      req.session.messageType = "error";
      return res.redirect('/member/profile-details');
    }

    // 6. RENDER DASHBOARD ---------------------------------------------------------------
    return res.render('member/my-dashboard', { 
      hasFacility, 
      facility, 
      hasSacco,
      sacco,
      contribution,
      warning 
    });

  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

// -----------------------------------------------------------------------------------------------
// PROFILE DETAILS
// -----------------------------------------------------------------------------------------------
router.get('/profile-details', ensureAuthenticated, async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Session expired, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const memberId = req.session.userMember;

  try {
    const [member] = await db.query(`SELECT * FROM members_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

    if (member.length === 0) {
      req.session.message = 'Member with details not found!';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    const membershipType = member[0].membership_type;

    const [profileRows] = await db.query(`SELECT * FROM member_profile_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

    const [facilityRows] = await db.query(`SELECT * FROM facilities_tbl WHERE member_id = ? LIMIT 1`, [memberId]);


    const [benefitRows] = await db.query(`SELECT * FROM benefits_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

    let hasProfile = profileRows.length > 0;
    let profile = hasProfile ? profileRows[0] : {};

    let hasFacility = facilityRows.length > 0;
    let facility = hasFacility ? facilityRows[0] : {};

    let hasBenefits = benefitRows.length > 0;
    let benefits = hasBenefits ? benefitRows[0] : {};

    return res.render('member/profile-details', {
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
    return res.redirect('/member/profile-details');
  }
});

router.get('/my-profile', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const memberId = req.session.userMember;

    if (!userId || !memberId) {
      req.session.destroy(() => res.redirect('/auth/login'));
      return;
    }

    const [userRows] = await db.execute(
      `SELECT user_id, fullname, email, idNumber, role, status, create_at, updated_at, last_login 
       FROM user_tbl 
       WHERE user_id = ? 
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      req.session.message = 'User not found.';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    const [results] = await db.query(
      `SELECT m.member_id, m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name, p.dob,
              m.status, m.reg_date, p.phone, p.gender, p.id_number, p.county, p.sub_county, p.ward, 
              p.disability, p.education_level, p.next_kin_name, p.kin_rln, p.kin_phone, p.kin_location, 
              p.member_doc, p.member_id_doc
       FROM members_tbl m 
       LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id 
       WHERE m.member_id = ? 
       LIMIT 1`,
      [memberId]
    );

    if (results.length === 0) {
      req.session.message = 'Member not found!';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    const details = results[0];

    const [facilityRows] = await db.query(`SELECT * FROM facilities_tbl WHERE member_id = ?`, [memberId]);

    let benefits = null;

    const [benefitRows] = await db.query(`SELECT benefits FROM benefits_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

    if (benefitRows.length === 1) {
      try {
        benefits = JSON.parse(benefitRows[0].benefits);
      } catch (e) {
        console.error("Invalid JSON in benefits ", e);
      }
    }

    const [saccoRow] = await db.query(
      `SELECT * FROM sacco_members_tbl WHERE member_id = ? LIMIT 1`,
      [memberId]
    );

    const saccos = saccoRow.length > 0 ? saccoRow[0] : null;

    res.render('member/my-profile', {
      user: userRows[0],
      details,
      facility: facilityRows,
      benefits,
      saccos
    });

  } catch (err) {
    console.error('Error loading profile:', err);
    req.session.message = 'Unable to load profile details.';
    req.session.messageType = 'error';
    return res.redirect('/member/my-dashboard');
  }
});

router.post('/user-change-password', ensureAuthenticated, memberController.userChangePassword);

router.post('/update-member-details', ensureAuthenticated, ensureRole(['Member']), memberController.updateMemberProfile);

router.post('/update-member-benefits', ensureAuthenticated, ensureRole(['Member']), memberController.updateMemberBenefits);

router.get('/my-facility', ensureAuthenticated, async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Session expired, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const memberId = req.session.userMember;

  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;
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

  if(memberId) {
  conditions.push(`f.member_id = ?`);
  params.push(memberId);
  }

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
      ${whereSQL} ORDER BY ${orderSQL} ${perPage} OFFSET ${offset}`, [...params]
    );

    // --- DROPDOWN DATA ---
    const [countiesList] = await db.query(
      `SELECT DISTINCT f_county FROM facilities_tbl WHERE f_county IS NOT NULL AND member_id = ?`, [memberId]
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

    res.render('member/my-facility', {
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

router.post('/add-facility-details', ensureAuthenticated, ensureRole(['Member']), memberController.memberAddFacility);

router.post('/view-facility-details', ensureAuthenticated, memberController.getFacilityDetails);

router.get('/my-facility-details', ensureAuthenticated, async (req, res) => {

  if (!req.session.facilityDetails) {
    req.session.message = 'Unable to get the selected facility details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/member/my-facility');
  }

  const  facilityId = req.session.facilityDetails;
  const memberId = req.session.userMember;

  try {
    const [rows] = await db.execute(
      `SELECT f.facility_id, f.facility_name, f.facility_type, f.setup_type, f.facility_estab_year, f.reg_no, f.license_no, 
              f.male_b, f.female_b, f.male_b_dis, f.female_b_dis, f.male_c, f.female_c, 
              f.f_county, f.f_subcounty, f.f_area, f.status, f.reg_date, f.total_beneficiaries, f.total_caregivers,
              m.membership_no, CONCAT(m.first_name, ' ', m.last_name) AS full_name
       FROM facilities_tbl f LEFT JOIN members_tbl m ON f.member_id = m.member_id
       WHERE f.facility_id = ? AND f.member_id = ? LIMIT 1`, [facilityId, memberId]);

    if (rows.length === 0) {
      req.session.message = 'Facility not found.';
      req.session.messageType = 'error';
      return res.redirect('/member/my-facility');
    }

    const facility = rows[0];

    res.render('member/my-facility-details', { facility });

  } catch (err) {
    console.error('Error loading facility profile:', err);
    req.session.message = 'Error loading facility profile.';
    req.session.messageType = 'error';
    res.redirect('/member/my-facility');
  }
});

router.post('/update-facility-details', ensureAuthenticated, ensureRole(['Member']), memberController.updateFacilityDetails);

router.post('/update-facility-status/:facility_id', ensureAuthenticated, ensureRole(['Member']), memberController.updateFacilityStatus);

router.get('/export-facilities', ensureAuthenticated, ensureRole(['Member']), async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Unable to get the selected facility details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const member_id = req.session.userMember;

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
        facility_name,
        facility_type,
        setup_type,
        facility_estab_year,
        reg_no,
        license_no,
        male_b,
        female_b,
        male_b_dis,
        female_b_dis,
        male_c,
        female_c,
        f_county,
        f_subcounty,
        f_area AS f_ward,
        status,
        reg_date,
        total_beneficiaries,
        total_caregivers
      FROM facilities_tbl 
      WHERE 1=1
    `;

    const params = [];

    query += ` AND member_id = ?`;
    params.push(member_id);

    // --- Filters ---
    if (county) {
      const countyList = county.split(',').map(c => c.trim()).filter(Boolean);
      if (countyList.length === 1) {
        query += ` AND f_county = ?`;
        params.push(countyList[0]);
      } else if (countyList.length > 1) {
        // Check required filters when exporting multiple counties
        if (!(status || facilityType || orderBy)) {
          req.session.message = "Select either a status, facility type, or order by to export multiple counties.";
          req.session.messageType = "error";
          return res.redirect('/member/my-facility');
        }
        query += ` AND f_county IN (${countyList.map(() => '?').join(',')})`;
        params.push(...countyList);
      }
    }

    if (sub_county) {
      query += ` AND f_subcounty = ?`;
      params.push(sub_county);
    }
    if (ward) {
      query += ` AND f_area = ?`;
      params.push(ward);
    }
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (facilityType) {
      query += ` AND facility_type = ?`;
      params.push(facilityType);
    }

    if (startDate && endDate) {
      query += ` AND DATE(reg_date) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ` AND DATE(reg_date) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(reg_date) <= ?`;
      params.push(endDate);
    }

    // --- Sorting ---
    if (orderBy === 'beneficiaries') {
      query += ` ORDER BY total_beneficiaries DESC`;
    } else if (orderBy === 'caregivers') {
      query += ` ORDER BY total_caregivers DESC`;
    } else {
      query += ` ORDER BY reg_date DESC`;
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
      return res.redirect('/member/my-facility');
    }

    // --- Fields for export ---
    const fields = [
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
      res.attachment(`my_facilities_export_${Date.now()}.csv`);
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
      res.attachment(`my_facilities_export_${Date.now()}.xlsx`);
      return res.send(buffer);
    }

    return res.json(rows);

  } catch (err) {
    console.error('Error exporting facilities:', err);
    res.status(500).send('Error exporting facilities data.');
  }
});

router.get('/my-sacco', ensureAuthenticated, async (req, res) => {

  const perPage = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;
  const offset = (page - 1) * perPage;

  const startDate = req.query.start || '';
  const endDate = req.query.end || '';
  const loanType = req.query.loanType || '';
  const exportType = req.query.exportType || '';
  

  if (!req.session.userMember) {
    req.session.message = 'Unable to get sacco details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const member_id = req.session.userMember;

  try {

    const [results] = await db.query(
        `SELECT sacco_member_id, s.member_id, s.membership_no, s.shares, s.savings, s.loan_balance, s.status AS sacco_status, s.join_date, s.notes, 
        s.created_at, s.updated_at, CONCAT(m.first_name, ' ', m.last_name) AS full_name, m.email, m.membership_type, p.phone, p.id_number, p.gender, p.disability,
        p.dob,  p.education_level, p.next_kin_name, p.kin_rln, p.kin_phone, p.kin_location, p.county, 
        p.sub_county, p.ward FROM sacco_members_tbl s INNER JOIN members_tbl m ON s.member_id = m.member_id
        LEFT JOIN member_profile_tbl p ON m.member_id = p.member_id WHERE s.member_id = ? LIMIT 1`, [member_id]
      );

      if (results.length === 0) {
        req.session.message = 'Your data not found in Sacco members';
        req.session.messageType = 'error';
        return res.redirect('/member/my-dashboard');
      }


    const details = results[0] || null;

    const conditions = [`sacco_member_id = ?`];
    const params = [details.sacco_member_id];

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

    const [loanRows] = await db.query(`SELECT * FROM loans_tbl ${whereSQL} ORDER BY created_at DESC ${perPage} OFFSET ${offset}`,
      [...params]);

      const [rowTypes] = await db.query(`SELECT * FROM loan_types_tbl`);
      
    res.render('member/my-sacco', {
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

router.post('/confirm-sacco-member-join', ensureAuthenticated, ensureRole(['Member']), memberController.confirmSaccoMemberAdd);

router.get('/my-contributions', ensureAuthenticated, async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Unable to get sacco details, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const memberId = req.session.userMember;

  const perPageOptions = [10, 25, 50, 100, 250];
  const perPage = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;
  const offset = (page - 1) * perPage;
  const search = (req.query.search || '').trim(); // reference_no search
  const contributionType = req.query.contributionType || '';
  const paymentMethod = req.query.paymentMethod || '';
  const sortBy = req.query.sortBy || 'contribution_date'; // or 'amount'

  let conditions = [];
  let params = [];

  conditions.push(`c.member_id = ?`);
  params.push(memberId);

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
        ${perPage} OFFSET ${offset}`,
        [...params]
    );

    const [types] = await db.query(`SELECT DISTINCT contribution_type FROM contributions_tbl WHERE contribution_type IS NOT NULL AND member_id = ?`, [memberId]);
    const [methods] = await db.query(`SELECT DISTINCT payment_method FROM contributions_tbl WHERE payment_method IS NOT NULL AND member_id = ?`, [memberId]);

    res.render('member/my-contributions', {
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

router.post('/add-contributions', ensureAuthenticated, memberController.addContribution);

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

// -------------------------------------------------------------------------------------------------
// MEMBER PROFILE DETAILS
// -------------------------------------------------------------------------------------------------

router.post('/add-member-location', ensureAuthenticated, ensureRole(['Member']), memberController.getMemberLocation);
router.post('/add-member-profile', ensureAuthenticated, membershipDocsUpload.fields([ { name: "memberDoc", maxCount: 1 }, { name: "memberIdDoc", maxCount: 1 } ]), memberController.addProfileDetails);
router.post('/add-facility-details', ensureAuthenticated, memberController.addFacilityDetails);
router.post('/add-member-benefits', ensureAuthenticated, memberController.addBenefitsDetails);
router.post('/confirm-member-details', ensureAuthenticated, memberController.memberDetailsConfirm);

// -------------------------------------------------------------------------------------------------
// PORTAL DYNAMIC ROUTES
// 1. Allowed pages 
// 2. allowed users and roles 
// -------------------------------------------------------------------------------------------------

// allowed pages and roles
const pageAccessMap = {
  'my-dashboard' : ['Member'],
  'my-profile': ['Member'],
  'profile-details': ['Member'],
  'my-facility': ['Member'],
  'my-facility-details': ['Member'],
  'my-contributions': ['Member'],
  'my-sacco': ['Member']
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
      return res.redirect('/member/my-dashboard');
    }

    // Check allowed map
    if (!pageAccessMap[page]) {
      req.session.message = 'This page does not exist or access is restricted.';
      req.session.messageType = 'error';
      return res.redirect('/member/my-dashboard');
    }

    // role is allowed
    const allowedRoles = pageAccessMap[page];
    if (!allowedRoles.includes(userRole)) {
      if (logActivity) {
        await logActivity(userId, null, 'ACCESS_DENIED', `Unauthorized access attempt to ${page}`, req);
      }

      req.session.message = 'Access denied. You do not have permission to view this page.';
      req.session.messageType = 'error';
      return res.redirect('/member/my-dashboard');
    }

    // Render the page safely
    res.render(`member/${page}`, {
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
    res.redirect('/member/my-dashboard');
  }
});


module.exports = router;
