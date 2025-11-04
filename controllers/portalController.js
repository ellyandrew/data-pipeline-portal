const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { Parser } = require('json2csv');
const xlsx = require('xlsx');
const regionMap = require('../utils/regionMap');
const { normalizeValue, normalizeNumber } = require('../utils/dataHelper');
const { logActivity } = require('../utils/logger');

// -----------------------------------------------------------------------------------------------
// Membership number validator
// -----------------------------------------------------------------------------------------------
function parseMembership(membership) {
  const rx = /^(\d{3})-(\d{3})-(\d{2})-(\d{4,6})$/;
  const match = String(membership).trim().match(rx);

  if (!match) {
    return null;
  }

   const [, countyCode, subCountyCode, wardCode, memberCode] = match;

  return { countyCode, subCountyCode, wardCode, memberCode };
}

function resolveMembershipNames(parsed, regionMap) {
  let countyName = null, subCountyName = null, wardName = null;

  for (const [cName, cData] of Object.entries(regionMap)) {
    if (cData.code === parsed.countyCode) {
      countyName = cName;

      for (const [scName, scData] of Object.entries(cData.subcounties)) {
        if (scData.code === parsed.subCountyCode) {
          subCountyName = scName;

          for (const [wName, wCode] of Object.entries(scData.wards)) {
            if (wCode === parsed.wardCode) {
              wardName = wName;
            }
          }
        }
      }
    }
  }

  if (!countyName || !subCountyName || !wardName) {
    return null;
  }

  return {
    county: countyName,
    subCounty: subCountyName,
    ward: wardName,
    memberId: parsed.memberCode 
  };
}

// ------------------------------------------------------------------------------------------------
// 1. ADD MEMBERS
// ------------------------------------------------------------------------------------------------

exports.addMember = async (req, res) => {

  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  try {
    const userRole = req.session.user_role;

    let status = 'Pending';
    if (userRole === 'Admin') {
      status = 'Active';
    } else if (userRole === 'Data Clerk') {
      status = 'Pending';
    }

    const { firstName, middleName, lastName, email, membershipType, county, subCounty, ward } = req.body;

    if (!firstName || !lastName || !email || !membershipType || !county || !subCounty || !ward) {
      req.session.message = "All fields are required!";
      req.session.messageType = "error";
      req.session.values = req.body;
      return res.redirect("/portal/add-member");
    }

    const [memberCheck] = await db.query(
      `SELECT email FROM members_tbl WHERE email = ? LIMIT 1`,
      [email]
    );

    if (memberCheck.length > 0) {
      req.session.message = "A member with this email already exists!";
      req.session.messageType = "error";
      req.session.values = req.body;
      return res.redirect("/portal/add-member");
    }

    const [checkFee] = await db.query(`SELECT membership_fee FROM settings_tbl`);
    const feeAmount = checkFee[0].membership_fee;

    const [result] = await db.execute(
      `INSERT INTO members_tbl (first_name, middle_name, last_name, email, membership_type, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [firstName, middleName || null, lastName, email, membershipType, "Member"]
    );

    const insertId = result.insertId;
    const fullName = `${firstName} ${lastName}`.trim();

    const countyCode = regionMap[county].code;
    const subCountyCode = regionMap[county].subcounties[subCounty].code;
    const wardCode = regionMap[county].subcounties[subCounty].wards[ward];
    const membershipNo = `${countyCode}-${subCountyCode}-${wardCode}-${insertId}`;

    const hashedPassword = await bcrypt.hash(membershipNo, 10);

    await db.query(
      `UPDATE members_tbl SET membership_no = ?, password = ? WHERE member_id = ? LIMIT 1`,
      [membershipNo, hashedPassword, insertId]
    );

    if (membershipType === 'Sacco In') {
      await db.execute(
        `INSERT INTO sacco_members_tbl (member_id, membership_no, shares, savings, loan_balance, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [insertId, membershipNo, 0, 0, 0, status]);
    }

    req.session.registrationDraft = {
      isStep: 1, 
      membership_type: membershipType,
      membership_no: membershipNo,
      full_name: fullName,
      county: county,
      sub_county: subCounty,
      ward: ward,
      member_id: insertId,
    };

    await logActivity(req.session.userId, insertId, "MEMBER CREATED", `New member created with membership number ${membershipNo}`, req);
    
    await db.execute(`INSERT INTO contributions_tbl (contribution_type, amount) VALUES(?, ?)`, ['Membership Fee', feeAmount]);

    req.session.message = "Membership details created successfully! Continue with Profile details.";
    req.session.messageType = "success";
    return res.redirect("/portal/add-member");

  } catch (err) {
    req.session.message = err.message;
    req.session.messageType = "error";
    return res.redirect("/portal/members");
  }
};

// exports.addMember = async (req, res) => {

//   if (!req.session.userId) {
//     req.session.message = 'Session expired, please try again!';
//     req.session.messageType = 'error';
//     return res.redirect('/auth/login');
//   }

//   const connection = await db.getConnection();
//   await connection.beginTransaction();

//   try {
//     const { firstName, middleName, lastName, email, membershipType, county, subCounty, ward } = req.body;

//     if (!firstName || !lastName || !email || !membershipType || !county || !subCounty || !ward) {
//       req.session.message = "All fields are required!";
//       req.session.messageType = "error";
//       req.session.values = req.body;
//       await connection.release();
//       return res.redirect("/portal/add-member");
//     }

//     const [memberCheck] = await connection.query(`SELECT email FROM members_tbl WHERE email = ? LIMIT 1`, [email]);

//     if (memberCheck.length > 0) {
//       req.session.message = "A member with this email already exists!";
//       req.session.messageType = "error";
//       req.session.values = req.body;
//       await connection.release();
//       return res.redirect("/portal/add-member");
//     }

//     const [result] = await connection.execute(
//       `INSERT INTO members_tbl (first_name, middle_name, last_name, email, membership_type, role)
//        VALUES (?, ?, ?, ?, ?, ?)`,
//       [firstName, middleName || null, lastName, email, membershipType, "Member"]
//     );

//     const insertId = result.insertId;
//     const fullName = `${firstName} ${lastName}`.trim();

//     const countyCode = regionMap[county].code;
//     const subCountyCode = regionMap[county].subcounties[subCounty].code;
//     const wardCode = regionMap[county].subcounties[subCounty].wards[ward];
//     const membershipNo = `${countyCode}-${subCountyCode}-${wardCode}-${insertId}`;

//     const hashedPassword = await bcrypt.hash(membershipNo, 10);

//     await connection.query(
//       `UPDATE members_tbl SET membership_no = ?, password = ? WHERE member_id = ? LIMIT 1`, [membershipNo, hashedPassword, insertId] );

//     if (membershipType === 'Sacco In') {
//       await connection.query(
//         `INSERT INTO sacco_members_tbl (member_id, membership_no, county, sub_county, ward)
//          VALUES (?, ?, ?, ?, ?)`,
//         [insertId, membershipNo, county, subCounty, ward]
//       );
//     }

//     // ✅ Commit transaction
//     await connection.commit();

//     // ✅ Log activity
//     await logActivity(
//       req.session.userId,
//       insertId,
//       "MEMBER CREATED",
//       `New member created with membership number ${membershipNo}`,
//       req
//     );

//     // ✅ Prepare next step (profile setup)
//     req.session.registrationDraft = {
//       isStep: 1,
//       membership_type: membershipType,
//       membership_no: membershipNo,
//       full_name: fullName,
//       county,
//       sub_county: subCounty,
//       ward,
//       member_id: insertId,
//     };

//     req.session.message = "Membership details created successfully! Continue with Profile details.";
//     req.session.messageType = "success";
//     await connection.release();
//     return res.redirect("/portal/add-member");

//   } catch (err) {
//     await connection.rollback();
//     console.error("Add Member Error:", err);
//     req.session.message = "Error adding member: " + err.message;
//     req.session.messageType = "error";
//     await connection.release();
//     return res.redirect("/portal/members");
//   }
// };


// ------------------------------------------------------------------------------------------------
// 2. ADD MEMBERS PROFILE 
// ------------------------------------------------------------------------------------------------

exports.addMemberProfile = async (req, res) => {
  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const {
    county, sub_county, membership_type, membership_no, ward, member_id
  } = req.session.registrationDraft;

  const {
    phoneNumber, idNumber, dob, gender, disability, educationLevel,
    citizenship, country, kinName, kinRln, kinPhone, kinLocation
  } = req.body;

  const files = req.files || {};
  const basePath = `/uploads/documents/members/${membership_no}`;
  const memberDoc = files.memberDoc ? `${basePath}/${files.memberDoc[0].filename}` : null;
  const memberIdDoc = files.memberIdDoc ? `${basePath}/${files.memberIdDoc[0].filename}` : null;

  const nextStep = membership_type === "Facility In" ? 2 : 3;

  try {
    const [duplicateCheck] = await db.query(
      `SELECT * FROM member_profile_tbl 
       WHERE (id_number = ? OR phone = ?) AND member_id != ? LIMIT 1`,
      [idNumber, phoneNumber, member_id]
    );

    if (duplicateCheck.length > 0) {
      req.session.message = 'A member with this National ID or phone number already exists!';
      req.session.messageType = 'error';
      req.session.values = req.body;
      return res.redirect('/portal/add-member');
    }

    const [profileCheck] = await db.query(
      `SELECT * FROM member_profile_tbl WHERE member_id = ? LIMIT 1`,
      [member_id]
    );

    if (profileCheck.length > 0) {
      await db.execute(
        `UPDATE member_profile_tbl SET 
          phone = ?, id_number = ?, dob = ?, gender = ?, disability = ?, 
          education_level = ?, citizenship = ?, country = ?, county = ?, 
          sub_county = ?, ward = ?, next_kin_name = ?, kin_rln = ?, 
          kin_phone = ?, kin_location = ?, 
          member_doc = COALESCE(?, member_doc),
          member_id_doc = COALESCE(?, member_id_doc)
        WHERE member_id = ?`,
        [
          phoneNumber, idNumber, dob, gender, disability, educationLevel,
          citizenship, country, county, sub_county, ward, kinName, kinRln,
          kinPhone, kinLocation, memberDoc, memberIdDoc, member_id
        ]
      );

      req.session.message = 'Personal details updated successfully!';
    } else {
      await db.execute(
        `INSERT INTO member_profile_tbl(
          member_id, phone, id_number, dob, gender, disability, 
          education_level, citizenship, country, county, sub_county, ward, 
          next_kin_name, kin_rln, kin_phone, kin_location, member_doc, member_id_doc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          member_id, phoneNumber, idNumber, dob, gender, disability,
          educationLevel, citizenship, country, county, sub_county, ward,
          kinName, kinRln, kinPhone, kinLocation, memberDoc, memberIdDoc
        ]
      );

      req.session.message = 'Personal details added successfully!';
    }

    req.session.registrationDraft = {
      ...req.session.registrationDraft,
      phoneNumber, idNumber, dob, gender, disability, educationLevel,
      citizenship, country, kinName, kinRln, kinPhone, kinLocation,
      isStep: nextStep
    };

    await logActivity(req.session.userId, member_id, "MEMBER_PROFILE_CREATED", `New member profile details created with ${idNumber} (${gender}, ${county}`, req);

    req.session.messageType = 'success';
    return res.redirect('/portal/add-member');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = 'error';
    return res.redirect('/portal/members');
  }
};

exports.getPreviousProfile = async (req, res) => {
  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }
    req.session.registrationDraft = {
          ...req.session.registrationDraft,
          isStep: 1
      };
    return res.redirect('/portal/add-member');
};

exports.addMemberProfileDraft = async (req, res) => {

    if (!req.session.userId || !req.session.memberDraft ) {
        req.session.message = 'Session expired, please try again!';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
    }

    const { county, sub_county, membership_no, ward, member_id } = req.session.memberDraft;

    const { phoneNumber, idNumber, dob, gender, disability, educationLevel, citizenship, country, kinName, kinRln, kinPhone, kinLocation } = req.body;


    const files = req.files || {};
    const basePath = `/uploads/documents/members/${membership_no}`;
    const memberDoc = files.memberDoc ? `${basePath}/${files.memberDoc[0].filename}` : null;
    const memberIdDoc = files.memberIdDoc ? `${basePath}/${files.memberIdDoc[0].filename}` : null;

    try {
        const [profileCheck] = await db.query(`SELECT * FROM member_profile_tbl WHERE id_number = ? OR member_id = ? LIMIT 1`, [idNumber, member_id]);

        if (profileCheck.length > 0){ 

          req.session.message = 'A member with this National ID / Passport already added!';
          req.session.messageType = 'error';
          req.session.values = req.body;
          return res.redirect('/portal/draft');
        }

      const [profileInsert] = await db.execute(`INSERT INTO member_profile_tbl(member_id, phone, id_number, dob, gender, disability, education_level, citizenship, country, county, 
        sub_county, ward, next_kin_name, kin_rln, kin_phone, kin_location, member_doc, member_id_doc) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          member_id, phoneNumber, idNumber, dob, gender, disability, educationLevel, citizenship, country, county, sub_county, ward, kinName, kinRln, kinPhone, kinLocation, memberDoc, memberIdDoc
        ]);

        req.session.memberDraft = {
          ...req.session.memberDraft,
      };
      
        if (profileInsert.affectedRows > 0) {

          await logActivity(req.session.userId, member_id, "DRAFT_PROFILE_ADDED", `Member profile created for ${idNumber} (${gender}, ${county})`, req);

          req.session.message = 'Personal details added successfully!';
          req.session.messageType = 'success';
          req.session.values = req.body;
          return res.redirect('/portal/draft');
        }
    } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/portal/draft');
    }
};

// ------------------------------------------------------------------------------------------------
// 3. ADD MEMBERS FACILITY
// ------------------------------------------------------------------------------------------------

exports.addMemberFacility = async (req, res) => {

  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

    const { county, sub_county, ward, member_id} = req.session.registrationDraft;
    const { facilityName, facilityType, setupType, yearStarted, registrationNumber, licenseNumber, maleB, femaleB, maleBD, femaleBD, maleC, femaleC } = req.body;
    
    const regNo = normalizeValue(registrationNumber);
    const licenseNo = normalizeValue(licenseNumber);

    const male_b = normalizeNumber(maleB);
    const female_b = normalizeNumber(femaleB);
    const male_b_dis = normalizeNumber(maleBD);
    const female_b_dis = normalizeNumber(femaleBD);
    const male_c = normalizeNumber(maleC);
    const female_c = normalizeNumber(femaleC);
    
  try {

      const [duplicateCheck] = await db.query(
        `SELECT * FROM facilities_tbl 
        WHERE (reg_no = ? OR license_no = ?) AND member_id != ? LIMIT 1`,
        [regNo, licenseNo, member_id]
      );

      if (duplicateCheck.length > 0) {
        req.session.message = 'A facility with this Registration or License number already exists!';
        req.session.messageType = 'error';
        req.session.values = req.body;
        return res.redirect('/portal/add-member');
      }

      const [existingFacility] = await db.query(`SELECT facility_id FROM facilities_tbl WHERE member_id = ? LIMIT 1`, [member_id]);

      if (existingFacility.length > 0) {
        await db.execute(
        `UPDATE facilities_tbl 
         SET facility_name = ?, facility_type = ?, setup_type = ?, facility_estab_year = ?, 
             reg_no = ?, license_no = ?, male_b = ?, female_b = ?, 
             male_b_dis = ?, female_b_dis = ?, male_c = ?, female_c = ?, 
             f_county = ?, f_subcounty = ?, f_area = ?
         WHERE member_id = ?`, [facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, male_b, female_b, male_b_dis, female_b_dis, 
          male_c, female_c, county, sub_county, ward, member_id]);

          req.session.message = 'Facility details updated successfully!';
          req.session.messageType = 'success';
      } else {
          await db.execute(`INSERT INTO facilities_tbl(member_id, facility_name, facility_type, setup_type, facility_estab_year, reg_no, license_no, male_b, female_b, 
          male_b_dis, female_b_dis, male_c, female_c, f_county, f_subcounty, f_area) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          member_id, facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, male_b, female_b, male_b_dis, female_b_dis, male_c, female_c, county, sub_county, ward
      ]);

      await logActivity(req.session.userId, member_id, "MEMBER_FACILITY_CREATED", `New member facility details created`, req);
        req.session.message = 'Facility details added successfully!';
        req.session.messageType = 'success';
      }

      req.session.registrationDraft = {
          ...req.session.registrationDraft,
          facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, male_b, female_b, male_b_dis, female_b_dis, 
          male_c, female_c,
          isStep: 3
      };

      return res.redirect('/portal/add-member');

  } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/portal/members');
  }
};

exports.getPreviousFacility = async (req, res) => {
  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }
    req.session.registrationDraft = {
          ...req.session.registrationDraft,
          isStep: 2
      };
    return res.redirect('/portal/add-member');
};

exports.addMemberFacilityDraft = async (req, res) => {

  if (!req.session.userId || !req.session.memberDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

    const { county, sub_county, ward, member_id} = req.session.memberDraft;
    const { facilityName, facilityType, setupType, yearStarted, registrationNumber, licenseNumber, maleB, femaleB, maleBD, femaleBD, maleC, femaleC} = req.body;

    const regNo = normalizeValue(registrationNumber);
    const licenseNo = normalizeValue(licenseNumber);
    
  try {
      const [facilityCheck] = await db.query(`SELECT * FROM facilities_tbl WHERE reg_no = ? OR license_no = ? LIMIT 1`, [regNo, licenseNo]);

        if (facilityCheck.length > 0){ 

          req.session.message = 'Facility with Registration / License Number already added!';
          req.session.messageType = 'error';
          req.session.values = req.body;
          return res.redirect('/portal/draft');
        }

       const [rows] = await db.execute(`INSERT INTO facilities_tbl(member_id, facility_name, facility_type, setup_type, facility_estab_year, reg_no, license_no, male_b, female_b, 
      male_b_dis, female_b_dis, male_c, female_c, f_county, f_subcounty, f_area) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        member_id, facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, maleB, femaleB, maleBD, femaleBD, maleC, 
        femaleC, county, sub_county, ward
      ]);

      if (rows.affectedRows > 0) {
        await logActivity(req.session.userId, member_id, "MEMBER_FACILITY_DRAFT_CREATED", `New member profile details created`, req);
        req.session.message = 'Facility details added successfully!';
        req.session.messageType = 'success';
        req.session.memberDraft = {...req.session.memberDraft};
        return res.redirect('/portal/draft');
      }

  } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/portal/draft');
  }
};

// ------------------------------------------------------------------------------------------------
// 3. ADD MEMBERS BENEFITS
// ------------------------------------------------------------------------------------------------
exports.addMemberBenefits = async (req, res) => {
  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = "Session expired, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const { member_id } = req.session.registrationDraft;

  const { competency_cert, childcare_training_done, childcare_training_access, biz_dev_mentorship, childcare_design_benefit, active_bank, banking_services, 
    emergency_loan, business_loan, asset_loan, education_loan, health_insurance, other } = req.body;

  const benefitsJson = {
    competency_cert: competency_cert || null,
    childcare_training_done: childcare_training_done || null,
    childcare_training_access: childcare_training_access || null,
    biz_dev_mentorship: biz_dev_mentorship || null,
    childcare_design_benefit: childcare_design_benefit || null,
    active_bank: active_bank || null,
    banking_services: banking_services || null,
    emergency_loan: emergency_loan || null,
    business_loan: business_loan || null,
    asset_loan: asset_loan || null,
    education_loan: education_loan || null,
    health_insurance: health_insurance || null,
    other: other ||null
  };

  try {
    const [benefitCheck] = await db.query(
      `SELECT * FROM benefits_tbl WHERE member_id = ? LIMIT 1`,
      [member_id]
    );

    if (benefitCheck.length > 0) {
      await db.query(
        `UPDATE benefits_tbl SET benefits = ? WHERE member_id = ?`,
        [JSON.stringify(benefitsJson), member_id]
      );

      req.session.message = "Benefits updated successfully!";
      req.session.messageType = "success";
    } else {
      await db.query(
        `INSERT INTO benefits_tbl (member_id, benefits) VALUES (?, ?)`,
        [member_id, JSON.stringify(benefitsJson)]
      );
      await logActivity(req.session.userId, member_id, "MEMBER_BENEFITS_CREATED", `New member benefits details created`, req);
      req.session.message = "Benefits successfully saved!";
      req.session.messageType = "success";
    }
    req.session.registrationDraft = {
      ...req.session.registrationDraft,
      benefitsJson,
      isStep: 4,
    };

    return res.redirect("/portal/add-member");
  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/portal/members");
  }
};

exports.getPreviousBenefits = async (req, res) => {
  if (!req.session.userId || !req.session.registrationDraft) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }
    req.session.registrationDraft = {
          ...req.session.registrationDraft,
          isStep: 3
      };
    return res.redirect('/portal/add-member');
};

exports.addMemberBenefitsDraft = async (req, res) => {

  if (!req.session.userId || !req.session.memberDraft) {
    req.session.message = "Session expired, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const { member_id } = req.session.memberDraft;

  const { competency_cert, childcare_training_done, childcare_training_access, biz_dev_mentorship, childcare_design_benefit, active_bank, banking_services,
    emergency_loan, business_loan, asset_loan, education_loan, health_insurance, other } = req.body;

  const benefitsJson = {
    competency_cert: competency_cert || null,
    childcare_training_done: childcare_training_done || null,
    childcare_training_access: childcare_training_access || null,
    biz_dev_mentorship: biz_dev_mentorship || null,
    childcare_design_benefit: childcare_design_benefit || null,
    active_bank: active_bank || null,
    banking_services: banking_services || null,
    emergency_loan: emergency_loan || null,
    business_loan: business_loan || null,
    asset_loan: asset_loan || null,
    education_loan: education_loan || null,
    health_insurance: health_insurance || null,
    other: other ||null
  };

  try {

      const [benefitCheck] = await db.query(
        `SELECT * FROM benefits_tbl WHERE member_id = ? LIMIT 1`, [member_id]
      );

      if (benefitCheck.length > 0) {
        req.session.message = "A member already submitted programs & financial benefits!";
        req.session.messageType = "error";
        req.session.values = req.body;
        return res.redirect("/portal/draft");
      }

      await db.query(
        `INSERT INTO benefits_tbl (member_id, benefits) VALUES (?, ?)`,
        [member_id, JSON.stringify(benefitsJson)]
      );

      req.session.memberDraft = {
        ...req.session.memberDraft,
      };

    await logActivity(req.session.userId, member_id, "MEMBER_BENEFITS_CREATED", `New member benefits details created`, req);

    req.session.message = "Benefits successfully saved!";
    req.session.messageType = "success";
    return res.redirect("/portal/draft");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/portal/draft");
  }
};

// -----------------------------------------------------------------------------------------------
// 3. CONFIRM DETAILS
// -----------------------------------------------------------------------------------------------

exports.memberDetailsConfirm = async (req, res) => {

  if (!req.session.registrationDraft) {
    req.session.message = "Unable to confirm member, please try again!";
    req.session.messageType = "error";
    return res.redirect("/portal/dashboard");
  }

  try {

    const { member_id } = req.session.registrationDraft;

    const userRole = req.session.user_role;

    let memberStatus = 'Draft';
    if (userRole === 'Admin') {
      memberStatus = 'Active';
    } else if (userRole === 'Data Clerk') {
      memberStatus = 'Pending';
    }

      await db.execute(`UPDATE members_tbl SET status = ? WHERE member_id = ? LIMIT 1`, [memberStatus, member_id]);

      await logActivity(req.session.userId, member_id, 'MEMBER_ADD', `New member created with status ${memberStatus} by ${userRole}`, req);

      req.session.registrationDraft = {}
      req.session.message = "Member details were successfully saved!";
      req.session.messageType = "success";
      return res.redirect("/portal/members");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/portal/members");
  }
};

exports.memberDetailsConfirmDraft = async (req, res) => {

  if (!req.session.memberDraft) {
    req.session.message = "Session expired, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  try {

      const { member_id } = req.session.registrationDraft;

      const userRole = req.session.user_role;

      let memberStatus = 'Draft';
      if (userRole === 'Admin') {
        memberStatus = 'Active';
      } else if (userRole === 'Data Clerk') {
        memberStatus = 'Pending';
      }

      await db.execute(`UPDATE members_tbl SET status = ? WHERE member_id = ? LIMIT 1`, [memberStatus, member_id]);

      await logActivity(req.session.userId, member_id, 'MEMBER_ADD', `New member created with status ${memberStatus} by ${userRole}`, req);

      delete req.session.memberDraft;

      req.session.message = "Member details were successfully saved!";
      req.session.messageType = "success";
      return res.redirect("/portal/members");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/portal/member");
  }
};

// -----------------------------------------------------------------------------------------------
// 3. GET DRAFT MEMBER
// -----------------------------------------------------------------------------------------------

exports.getDraftMember = async (req, res) => {

  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const { membershipNumber } = req.body;

  try {

    const parsed = parseMembership(membershipNumber);

    if (!parsed) {
      req.session.message = "Invalid edit request";
      req.session.messageType = "error";
      return res.redirect('/portal/members');
    }

    const result = resolveMembershipNames(parsed, regionMap);

    const [rows] = await db.query(
      `SELECT membership_type, member_id FROM members_tbl WHERE membership_no = ? AND status = ? LIMIT 1`,
      [membershipNumber, 'Draft']
    );

    if (rows.length === 0) {
      req.session.message = "Draft not found for this membership number";
      req.session.messageType = "error";
      return res.redirect('/portal/members');
    }

    req.session.memberDraft = {
      ...req.session.memberDraft,
      membership_no: membershipNumber,
      membership_type: rows[0].membership_type,
      county: result.county,
      sub_county: result.subCounty,
      ward: result.ward,
      member_id: rows[0].member_id
    };

    res.redirect('/portal/draft');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/members');
  }
};

// ----------------------------------------------------------------------------------------------
// GET MEMBER DETAILS
// ----------------------------------------------------------------------------------------------
exports.getMemberDetails = async (req, res) => {

  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const { membershipNumber } = req.body;

  try {

    const parsed = parseMembership(membershipNumber);

    if (!parsed) {
      req.session.message = "Invalid view request";
      req.session.messageType = "error";
      return res.redirect('/portal/members');
    }

    const [rows] = await db.query(
      `SELECT membership_no, member_id FROM members_tbl WHERE membership_no = ? LIMIT 1`,
      [membershipNumber]
    );

    if (rows.length === 0) {
      req.session.message = "Data not found for this membership number";
      req.session.messageType = "error";
      return res.redirect('/portal/members');
    }
    const memberId = rows[0].member_id;

    req.session.memberDetails = { membership_no: membershipNumber, member_id: memberId};

    res.redirect('/portal/view-member');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/members');
  }
};

// ----------------------------------------------------------------------------------------------
// MANAGE MEMBER DETAILS
// ----------------------------------------------------------------------------------------------
exports.updateMemberProfile = async (req, res) => {

   if (!req.session.memberDetails) {
      req.session.message = 'Unable to complete your request, please try again!';
      req.session.messageType = 'error';
      return res.redirect('/portal/members');
   }

   const { member_id } = req.session.memberDetails;

   const { phoneNumber, idNumber, dob, gender, disability, educationLevel, citizenship, county, subCounty, ward, kinName, kinRln, kinPhone, kinLocation } = req.body;

   try {

    const [duplicateCheck] = await db.query(`SELECT * FROM member_profile_tbl WHERE (id_number = ? OR phone = ?) AND member_id != ? LIMIT 1`,
      [idNumber, phoneNumber, member_id]
    );

    if (duplicateCheck.length > 0) {
      req.session.message = 'A member with this National ID or phone number already exists!';
      req.session.messageType = 'error';
      req.session.values = req.body;
      return res.redirect('/portal/view-member');
    }

      await db.execute(
        `UPDATE member_profile_tbl SET phone = ?, id_number = ?, dob = ?, gender = ?, disability = ?, education_level = ?, county = ?, sub_county = ?, 
        ward = ?, next_kin_name = ?, kin_rln = ?, kin_phone = ?, kin_location = ? WHERE member_id = ? LIMIT 1`,
        [
          phoneNumber, idNumber, dob, gender, disability, educationLevel, county, subCounty, ward, kinName, kinRln, kinPhone, kinLocation, member_id
        ]
      );

      await logActivity(req.session.userId, member_id, "MEMBER_PROFILE_UPDATED", `Member profile details updated with ${phoneNumber}, ${idNumber}, ${dob}, (${gender}, ${disability}, 
        ${educationLevel}, ${county}, ${subCounty}, ${ward}, ${kinName}, ${kinRln}, ${kinPhone}, ${kinLocation}`, req);
      
      req.session.message = "Member details updated successfully!";
      req.session.messageType = "success";
      return res.redirect('/portal/view-member');

   } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/view-member');
   }
};

exports.updateMemberBenefits = async (req, res) => {

  if (!req.session.memberDetails) {
    req.session.message = "Unable to complete your request, please try again!";
    req.session.messageType = "error";
    return res.redirect("/portal/members");
  }

  const { member_id } = req.session.memberDetails;

  const { competency_cert, childcare_training_done, childcare_training_access, biz_dev_mentorship, childcare_design_benefit, active_bank, banking_services, 
    emergency_loan, business_loan, asset_loan, education_loan, health_insurance, other } = req.body;

  const benefitsJson = {
    competency_cert: competency_cert || null,
    childcare_training_done: childcare_training_done || null,
    childcare_training_access: childcare_training_access || null,
    biz_dev_mentorship: biz_dev_mentorship || null,
    childcare_design_benefit: childcare_design_benefit || null,
    active_bank: active_bank || null,
    banking_services: banking_services || null,
    emergency_loan: emergency_loan || null,
    business_loan: business_loan || null,
    asset_loan: asset_loan || null,
    education_loan: education_loan || null,
    health_insurance: health_insurance || null,
    other: other ||null
  };

  try {

    await db.query(`UPDATE benefits_tbl SET benefits = ? WHERE member_id = ?`, [JSON.stringify(benefitsJson), member_id]);

    await logActivity(req.session.userId, member_id, "MEMBER_BENEFITS_UPDATED", `Member benefits details updated`, req);

    req.session.message = "Member benefits updated successfully!";
    req.session.messageType = "success";
    return res.redirect("/portal/view-member");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/portal/view-member");
  }
};

exports.updateMemberStatus = async (req, res) => {
  const memberId = req.params.member_id;
  const { currentStatus, reason } = req.body;

  try {
    let newStatus;

    switch (currentStatus) {
      case 'Active':
        newStatus = 'Suspended';
        break;
      case 'Inactive':
      case 'Pending':
      case 'Draft':
      case 'Suspended':
        newStatus = 'Active';
        break;
      default:
        req.session.message = 'Invalid status action.';
        req.session.messageType = 'error';
        return res.redirect('/portal/view-member');
    }

    await db.execute(`UPDATE members_tbl SET status = ? WHERE member_id = ?`,[newStatus, memberId]);

    if (newStatus === 'Suspended') {
      const [facilities] = await db.query(`SELECT facility_id FROM facilities_tbl WHERE member_id = ? AND status != 'Closed'`, [memberId]);

      if (facilities.length > 0) {
        await db.execute(`UPDATE facilities_tbl SET status = 'Inactive' WHERE member_id = ?`, [memberId]);

        await logActivity(req.session.userId, memberId,'FACILITY_STATUS_UPDATE',`Facilities set to 'Closed' because member was suspended`, req);
      }
    } else if (newStatus === 'Active') {
      const [facilities] = await db.query(`SELECT facility_id FROM facilities_tbl WHERE member_id = ? AND status IN ('Inactive', 'Pending')`, [memberId]);

      if (facilities.length > 0) {
        await db.execute(`UPDATE facilities_tbl SET status = 'Active' WHERE member_id = ?`, [memberId]);

        await logActivity(req.session.userId, memberId,'FACILITY_STATUS_UPDATE', `Facilities reactivated after member was set to Active`, req);
      }
    }

    await logActivity(req.session.userId, memberId,'MEMBER_STATUS_UPDATE',`Changed member status from ${currentStatus} to ${newStatus}. ${reason}`,req);

    req.session.message = `Member status updated from ${currentStatus} to ${newStatus}.`;
    req.session.messageType = 'success';
    return res.redirect('/portal/view-member');

  } catch (err) {
    console.error('Error updating member status:', err);
    req.session.message = 'An error occurred while updating member status.';
    req.session.messageType = 'error';
    return res.redirect('/portal/view-member');
  }
};

// ---------------------------------------------------------------------------------------------
// GET FACILITY DETAILS
// ---------------------------------------------------------------------------------------------
exports.getFacilityDetails = async (req, res) => {

  const { member_id, facility_id } = req.body;

  try {

    req.session.facilityDetails = { memberId: member_id, facilityId: facility_id };

    res.redirect('/portal/view-facility');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/facilities');
  }
};

exports.updateFacilityDetails = async (req, res) => {

  if (!req.session.facilityDetails) {
    req.session.message = 'Unable to complete your update request, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/portal/facilities');
  }

    const { memberId, facilityId } = req.session.facilityDetails;

    const { facilityName, facilityType, setupType, yearStarted, county, subCounty, ward, registrationNumber, licenseNumber, maleB, femaleB, maleBD, femaleBD, maleC, femaleC } = req.body;
    
    const regNo = normalizeValue(registrationNumber);
    const licenseNo = normalizeValue(licenseNumber);

    const male_b = normalizeNumber(maleB);
    const female_b = normalizeNumber(femaleB);
    const male_b_dis = normalizeNumber(maleBD);
    const female_b_dis = normalizeNumber(femaleBD);
    const male_c = normalizeNumber(maleC);
    const female_c = normalizeNumber(femaleC);
    
  try {

       const [rowUpdate] = await db.execute(
        `UPDATE facilities_tbl SET facility_name = ?, facility_type = ?, setup_type = ?, facility_estab_year = ?, reg_no = ?, license_no = ?, male_b = ?, 
        female_b = ?, male_b_dis = ?, female_b_dis = ?, male_c = ?, female_c = ?, f_county = ?, f_subcounty = ?, f_area = ? WHERE facility_id = ? AND member_id = ? LIMIT 1`, 
        [facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, male_b, female_b, male_b_dis, female_b_dis, male_c, female_c, county, subCounty,
           ward, facilityId, memberId]);

        if (rowUpdate.affectedRows > 0) {
          await logActivity(req.session.userId, memberId, "FACILITY_UPDATED", `Facility details updated to ${facilityName}, ${facilityType}, ${setupType}, 
            ${yearStarted}, ${regNo}, ${licenseNo}, ${male_b}, ${female_b}, ${male_b_dis}, ${female_b_dis}, ${male_c}, ${female_c}, ${county}, ${subCounty},
           ${ward}`, req);

          req.session.message = 'Facility details updated successfully!';
          req.session.messageType = 'success';
          return res.redirect('/portal/view-facility');
        }

  } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/portal/facilities');
  }
};

exports.updateFacilityStatus = async (req, res) => {

  const facilityId = req.params.facility_id;
  const { currentStatus, reason } = req.body;

  try {
    let newStatus;

    switch (currentStatus) {
      case 'Active':
        newStatus = 'Inactive';
        break;
      case 'Inactive':
      case 'Pending':
        newStatus = 'Active';
        break;
      default:
        req.session.message = 'Invalid status action.';
        req.session.messageType = 'error';
        return res.redirect('/portal/view-facility');
    }

    await db.execute(`UPDATE facilities_tbl SET status = ? WHERE facility_id = ?`,[newStatus, facilityId]);

    await logActivity(req.session.userId, null,'FACILITY_STATUS_UPDATE',`Changed facility status from ${currentStatus} to ${newStatus}. ${reason}`,req);

    req.session.message = `Facility status updated from ${currentStatus} to ${newStatus}.`;
    req.session.messageType = 'success';
    return res.redirect('/portal/view-facility');

  } catch (err) {
    console.error('Error updating facility status:', err);
    req.session.message = 'An error occurred while updating facility status.';
    req.session.messageType = 'error';
    return res.redirect('/portal/view-facility');
  }
};

// --------------------------------------------------------------------------------------------
// MANAGE PORTAL USERS
// --------------------------------------------------------------------------------------------
exports.addPortalUser = async (req, res) => {

  const { fullName, idNumber, email, role } = req.body;

  try {

    const [userCheck] = await db.query(`SELECT * FROM user_tbl WHERE email = ? OR idNumber = ? LIMIT 1`, [email, idNumber]);

    if (userCheck.length > 0) {
      req.session.message = 'User already exists with Email or ID Number!';
      req.session.messageType = 'error';
      return res.redirect('/portal/users');
    }
    
    const hashedPassword = await bcrypt.hash(idNumber, 10);

    await db.execute(`INSERT INTO user_tbl (fullname, email, idNumber, role, password, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [fullName, email, idNumber, role, hashedPassword, 'Pending']);

    await logActivity(req.session.userId, null, "USER_CREATED", `New user ${fullName} (${role}) added.`, req);

    req.session.message = 'User added successfully!';
    req.session.messageType = 'success';
    res.redirect('/portal/users');

  } catch (err) {
    console.error(err);
    req.session.message = 'Error adding user.';
    req.session.messageType = 'error';
    res.redirect('/portal/users');
  }
};

exports.viewProfile = async (req, res) => {
  try {
    const [userRows] = await db.execute(
      `SELECT user_id, fullname, email, idNumber, role, status, create_at, updated_at, last_login
       FROM user_tbl 
       WHERE user_id = ? LIMIT 1`,
      [req.session.userId]
    );

    if (userRows.length === 0) {
      req.session.message = 'User not found.';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    res.render('portal/profile', { user: userRows[0] });

  } catch (err) {
    console.error('Error loading profile:', err);
    req.session.message = 'Unable to load profile details.';
    req.session.messageType = 'error';
    res.redirect('/portal/dashboard');
  }
};

exports.viewUserDetails = async (req, res) => {

  const { userId } = req.body;

  try {

    req.session.userDetails = { userId: userId };

    res.redirect('/portal/view-user');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/users');
  }
};

exports.editUserStatus = async (req, res) => {

  const userId = req.params.user_id;
  const { currentStatus } = req.body;

  try {
    let newStatus;

    switch (currentStatus) {
      case 'Active':
        newStatus = 'Suspended';
        break;
      case 'Suspended':
        newStatus = 'Deleted';
        break;
      default:
        req.session.message = 'Invalid status action.';
        req.session.messageType = 'error';
        return res.redirect('/portal/view-user');
    }

    await db.execute(`UPDATE user_tbl SET status = ? WHERE user_id = ?`,[newStatus, userId]);

    await logActivity(req.session.userId, null,'USER_STATUS_UPDATE',`Changed user status from ${currentStatus} to ${newStatus}.`,req);

    req.session.message = `USer status updated from ${currentStatus} to ${newStatus}.`;
    req.session.messageType = 'success';
    return res.redirect('/portal/view-user');

  } catch (err) {
    console.error('Error updating user status:', err);
    req.session.message = 'An error occurred while updating user status.';
    req.session.messageType = 'error';
    return res.redirect('/portal/view-user');
  }
};

exports.resetUserAccount =  async (req, res) => {

   const userId = req.params.user_id;
 
  try {
    const [checkUser] = await db.query(
      `SELECT idNumber, status FROM user_tbl WHERE user_id = ? LIMIT 1`, [userId]
    );

    if (checkUser.length === 0) {
      req.session.message = 'User not found!';
      req.session.messageType = 'error';
      return res.redirect('/portal/users');
    }

    const user = checkUser[0];

    if (user.status !== 'Blocked') {
      req.session.message = 'User account must be blocked to retrieve it!';
      req.session.messageType = 'error';
      return res.redirect('/portal/view-user');
    }

     const hashedPassword = await bcrypt.hash(String(user.idNumber), 10);

    await db.execute(`UPDATE user_tbl SET password = ?, status = ?, updated_at = NOW() WHERE user_id = ? LIMIT 1`, [hashedPassword, 'Pending', userId]);

    await logActivity(req.session.userId, null, "USER_ACCOUNT_RESET", `User account for ID Number ${user.idNumber} was reset.`, req);

    req.session.message = `User account reset successful!`;
    req.session.messageType = 'success';
    res.redirect('/portal/view-user');

  } catch (err) {
    console.error('Error resetting user account:', err);
    req.session.message = 'Error resetting user account.';
    req.session.messageType = 'error';
    res.redirect('/portal/users');
  }
};

exports.userChangePassword = async (req, res) => {

    const user_id = req.session.userId;

    const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.session.message = 'All fields are required!';
      req.session.messageType = 'error';
      return res.redirect('/portal/profile');
    }

    if (newPassword !== confirmPassword) {
      req.session.message = 'Passwords do not match!';
      req.session.messageType = 'error';
      return res.redirect('/portal/profile');
    }

    if (newPassword.length < 8) {
      req.session.message = 'Password must be at least 8 characters long!';
      req.session.messageType = 'error';
      return res.redirect('/portal/profile');
    }

    const [users] = await db.query(`SELECT password, idNumber, status FROM user_tbl WHERE user_id = ? LIMIT 1`, [user_id]);

    if (users.length === 0) {
      req.session.message = 'User not found!';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    const user = users[0];

    const validOldPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validOldPassword) {
      req.session.message = 'Old password is incorrect!';
      req.session.messageType = 'error';
      return res.redirect('/portal/profile');
    }

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      req.session.message = 'New password must be different from the old one!';
      req.session.messageType = 'error';
      return res.redirect('/portal/profile');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.execute(`UPDATE user_tbl SET password = ?, password_date = NOW(), updated_at = NOW() WHERE user_id = ? LIMIT 1`,
      [hashedPassword, user_id]
    );

    await logActivity(req.session.userId, null, 'USER_CHANGE_PASSWORD', `User of ID Number ${user.idNumber}  changed password`, req);

    req.session.message = 'Password changed successfully! Please login';
    req.session.messageType = 'success';
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error changing password:', err);
    req.session.message = 'Error changing password.';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }
};

// --------------------------------------------------------------------------------------------
// MANAGE SACCO MEMBERS
// --------------------------------------------------------------------------------------------

exports.addSaccoMember = async (req, res) => {

  const { membershipNumber } = req.body;

  const userRole = req.session.user_role;

    let status = 'Pending';
    if (userRole === 'Admin') {
      status = 'Active';
    } else if (userRole === 'Data Clerk') {
      status = 'Pending';
    }

  try {

    const parsed = parseMembership(membershipNumber);

    if (!parsed) {
      req.session.message = "Invalid add request";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-member');
    }

    const [rows] = await db.query(
      `SELECT membership_no, member_id FROM members_tbl WHERE membership_no = ? LIMIT 1`,
      [membershipNumber]
    );

    if (rows.length === 0) {
      req.session.message = "Data not found for this membership number";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-member');
    }
    const memberId = rows[0].member_id;

    const [checkSacco] = await db.query(`SELECT * FROM sacco_members_tbl WHERE membership_no = ? OR member_id = ?  LIMIT 1`, [membershipNumber, memberId]);

    if (checkSacco.length > 0) {
      req.session.message = "This membership number already added to sacco";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-member');
    }

    await db.execute(
        `INSERT INTO sacco_members_tbl (member_id, membership_no, shares, savings, loan_balance, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [memberId, membershipNumber, 0, 0, 0, status]);

    await logActivity(req.session.userId, memberId, "SACCO_ADD", `New member added to sacco with membership number ${membershipNumber}`, req);

    req.session.message = "Member added to sacco successfully!";
    req.session.messageType = "success";
    res.redirect('/portal/sacco-member');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/sacco-member');
  }
};

exports.editSaccoStatus = async (req, res) => {

  const saccoId = req.params.sacco_member_id;
  const { currentStatus, reason } = req.body;

  try {

    let newStatus;

    switch (currentStatus) {
      case 'Pending':
        newStatus = 'Active';
        break;
      case 'Active':
        newStatus = 'Suspended';
        break;
      case 'Inactive':
        newStatus = 'Active';
        break;
      case 'Suspended':
        newStatus = 'Active';
        break;
      default:
        req.session.message = 'Invalid status action.';
        req.session.messageType = 'error';
        return res.redirect('/portal/sacco-details');
    }
    
    await db.execute(`UPDATE sacco_members_tbl SET status = ? WHERE sacco_member_id = ?`,[newStatus, saccoId]);

    await logActivity(req.session.userId, null,'SACCO_STATUS_UPDATE',`Changed sacco member status from ${currentStatus} to ${newStatus}. ${reason}`,req);

    req.session.message = `Member sacco status updated from ${currentStatus} to ${newStatus}.`;
    req.session.messageType = 'success';
    return res.redirect('/portal/sacco-details');

  } catch (err) {
    console.error('Error updating sacco member status:', err);
    req.session.message = 'An error occurred while updating user status.';
    req.session.messageType = 'error';
    return res.redirect('/portal/sacco-details');
  }
};

exports.getSaccoDetails = async (req, res) => {

  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const { saccoID } = req.body;

  try {

    const [rows] = await db.query(
      `SELECT sacco_member_id, member_id FROM sacco_members_tbl WHERE sacco_member_id = ? LIMIT 1`,
      [saccoID]
    );

    if (rows.length === 0) {
      req.session.message = "Sacco data not found for this membership number";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-member');
    }

    const selected_id = rows[0].member_id;
    const selected_sacco_id = rows[0].sacco_member_id;

    await db.execute(`UPDATE loans_tbl SET status = 'Defaulted' WHERE due_date < CURDATE() AND balance > 0 AND status IN ('Active')`);

    req.session.saccoDetails = { member_id: selected_id, sacco_id: selected_sacco_id};

    res.redirect('/portal/sacco-details');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/sacco-member');
  }
};

exports.addContribution = async (req, res) => {
  try {
    const { loan_id, sacco_member_id, contribution_type, amount, payment_method, reference_no, remarks } = req.body;

    if (!sacco_member_id || !contribution_type || !amount || !payment_method) {
      req.session.message = "All required fields must be filled!";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-details');
    }

    if (amount <= 0) {
      req.session.message = "Amount must be greater than zero!";
      req.session.messageType = "error";
      return res.redirect('/portal/sacco-details');
    }

    const [memberCheck] = await db.query(`SELECT member_id FROM sacco_members_tbl WHERE sacco_member_id = ? LIMIT 1`, [sacco_member_id]);
    if (memberCheck.length === 0) {
      req.session.message = "Invalid member selected!";
      req.session.messageType = "error";
      return res.redirect('/portal/contributions');
    }

    const memberId = memberCheck[0].member_id;



    await db.execute(
      `INSERT INTO contributions_tbl (sacco_member_id, member_id, contribution_type, amount, payment_method, reference_no, contribution_date, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [sacco_member_id, memberId, contribution_type, amount, payment_method, reference_no, remarks || null, 'Completed']
    );

    switch (contribution_type) {
      case 'Shares':
        await db.execute(`UPDATE sacco_members_tbl SET shares = shares + ? WHERE sacco_member_id = ?`, [amount, sacco_member_id]);
        break;
      case 'Savings':
        await db.execute(`UPDATE sacco_members_tbl SET savings = savings + ? WHERE sacco_member_id = ?`, [amount, sacco_member_id]);
        break;
      case 'Loan Repayment':

      const [loan] = await db.query('SELECT balance, status FROM loans_tbl WHERE loan_id = ? AND sacco_member_id = ? LIMIT 1',[loan_id, sacco_member_id]);

        if (loan.length === 0) {
            req.session.message = 'Invalid loan selected.';
            req.session.messageType = 'error';
            return res.redirect('/portal/sacco-details');
          }

        const balance = parseFloat(loan[0].balance);
        const repayment = parseFloat(amount);

        if (repayment > balance) {
            req.session.message = 'Repayment cannot exceed current loan balance.';
            req.session.messageType = 'error';
            return res.redirect('/portal/sacco-details');
          }

        const newBalance = balance - repayment;
        const newStatus = newBalance <= 0 ? 'Closed' : loan[0].status;
        
        await db.query(`UPDATE loans_tbl SET balance = ?, status = ? WHERE loan_id = ?`, [newBalance, newStatus, loan_id]);

        await db.execute(`UPDATE sacco_members_tbl SET loan_balance = loan_balance - ? WHERE sacco_member_id = ?`, [amount, sacco_member_id]);
        break;
      case 'Penalty':
        await db.execute(`UPDATE sacco_members_tbl SET loan_balance = loan_balance + ? WHERE sacco_member_id = ?`, [amount, sacco_member_id]);
        break;
    }

    await logActivity(req.session.userId, null,'ADD_CONTRIBUTION',`${contribution_type} of total amount ${amount} added through ${payment_method}, ref: ${reference_no}. ${remarks}`,req);
    
    req.session.message = `${contribution_type} contribution recorded successfully!`;
    req.session.messageType = "success";
    res.redirect('/portal/sacco-details');

  } catch (error) {
    console.error('Contribution add error:', error);
    req.session.message = "Server error while recording contribution!";
    req.session.messageType = "error";
    res.redirect('/portal/sacco-details');
  }
};


exports.issueLoan = async (req, res) => {
  const { sacco_member_id, loan_type_id, principal, interest_rate, interest_amount, total_repayment, repayment_period, repayment_source, issue_date } = req.body;

  try {
    const [loanType] = await db.query('SELECT * FROM loan_types_tbl WHERE loan_type_id = ?', [loan_type_id]);

    if (loanType.length === 0) {
      req.session.message = 'Invalid loan type selected.';
      req.session.messageType = 'error';
      return res.redirect('/portal/sacco-details');
    }

    const policy = {
      ...loanType[0],
      min_amount: parseFloat(loanType[0].min_amount),
      max_amount: parseFloat(loanType[0].max_amount),
      interest_rate: parseFloat(loanType[0].interest_rate)
    };

    if (principal < policy.min_amount || principal > policy.max_amount) {
      req.session.message = `Principal must be between ${policy.min_amount} and ${policy.max_amount}.`;
      req.session.messageType = 'error';
      return res.redirect('/portal/sacco-details');
    }

    if (repayment_period > policy.max_term_months) {
      req.session.message = `Repayment period exceeds maximum term of ${policy.max_term_months} months.`;
      req.session.messageType = 'error';
      return res.redirect('/portal/sacco-details');
    }

    const issueDate = new Date(issue_date);
    const dueDate = new Date(issueDate);
    dueDate.setMonth(dueDate.getMonth() + parseInt(repayment_period));

    await db.query(
      `INSERT INTO loans_tbl 
       (sacco_member_id, loan_type, principal, interest_rate, interest_amount, total_repayment, repayment_period, repayment_source, balance, status, issue_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      [sacco_member_id, policy.loan_name, principal, interest_rate, interest_amount, total_repayment, repayment_period, repayment_source, total_repayment, issue_date, dueDate]
    );

    await logActivity(req.session.userId, sacco_member_id, 'LOAN_ISSUED', `Issued ${policy.loan_name} of ${principal}`, req);

    await db.execute(`UPDATE sacco_members_tbl SET loan_balance = loan_balance + ? WHERE sacco_member_id = ?`, [total_repayment, sacco_member_id]);

    req.session.message = 'Loan issued successfully.';
    req.session.messageType = 'success';
    res.redirect('/portal/sacco-details');

  } catch (error) {
    console.error(error);
    req.session.message = 'An error occurred while issuing the loan.';
    req.session.messageType = 'error';
    res.redirect('/portal/sacco-details');
  }
};

// ------------------------------------------------------------------------------------------
// COLLECT DATA
// ------------------------------------------------------------------------------------------

exports.addDataCollect = async (req, res) => {
  try {

    const userRole = req.session.user_role;

    let status = 'Draft';
    if (userRole === 'Admin') status = 'Active';
    else if (userRole === 'Data Clerk') status = 'Pending';

    const {
      countyName, subCountyName,wardName,enumeratorName, idNumber, workerCategory, gender, age, educationLevel, receivedTraining, receivedCertificate, facilityName,
      facilityClassification, geoLocation, yearEstablished, totalChildren, girls, boys, age_under6, age_6_12, age_12_24, age_24_36, age_36_plus,
      children_with_disabilities, boys_with_disabilities, girls_with_disabilities, total_workers, female_workers, male_workers,
      workers_with_disabilities, member_institutions, loan_institutions, interested_in_finance, provider_name, phone_number } = req.body;

      const total_children = normalizeNumber(totalChildren);
      const t_girls = normalizeNumber(girls);
      const t_boys = normalizeNumber(boys);
      const under_6 = normalizeNumber(age_under6);
      const a_6_12 = normalizeNumber(age_6_12);
      const a_12_24 = normalizeNumber(age_12_24);
      const a_24_36 = normalizeNumber(age_24_36);
      const a_36_p = normalizeNumber(age_36_plus);
      const c_w_d = normalizeNumber(children_with_disabilities);
      const b_w_d = normalizeNumber(boys_with_disabilities);
      const g_w_d = normalizeNumber(girls_with_disabilities);
      const t_workers = normalizeNumber(total_workers);
      const f_worker = normalizeNumber(female_workers);
      const m_worker = normalizeNumber(male_workers);
      const w_w_d = normalizeNumber(workers_with_disabilities);

      const [checkRespondent] = await db.query(`SELECT * FROM childcare_survey_tbl WHERE id_number = ? LIMIT 1`, [idNumber]);

      if (checkRespondent.length > 0) {
        req.session.message = "Respondent with simillar ID already added";
        req.session.messageType = "error";
        return res.redirect('/portal/collect-data');
      }

    await db.execute(
      `INSERT INTO childcare_survey_tbl 
      (county_name, sub_county_name, ward_name, enumerator_name, id_number, worker_category, gender, age, education_level, received_training, received_certificate,
      facility_name, facility_classification, geo_location, year_established, total_children, girls, boys, age_under6, age_6_12, age_12_24, age_24_36, age_36_plus,
      children_with_disabilities, boys_with_disabilities, girls_with_disabilities, total_workers, female_workers, male_workers, workers_with_disabilities,
      member_institutions, loan_institutions, interested_in_finance, provider_name, phone_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        countyName, subCountyName, wardName, enumeratorName, idNumber, workerCategory, gender, age, educationLevel, receivedTraining, receivedCertificate,
        facilityName, facilityClassification, geoLocation, yearEstablished, total_children, t_girls, t_boys, under_6, a_6_12, a_12_24, a_24_36, a_36_p,
        c_w_d, b_w_d, g_w_d, t_workers, f_worker, m_worker, w_w_d, Array.isArray(member_institutions) ? member_institutions.join(',') : member_institutions,
        Array.isArray(loan_institutions) ? loan_institutions.join(',') : loan_institutions, interested_in_finance, provider_name, phone_number, status
      ]
    );

    // Log activity
    await logActivity(req.session.userId, null, "SURVEY_CREATED", `New childcare survey submitted for ${facilityName} (${countyName})`, req);

    req.session.message = 'Survey data submitted successfully.';
    req.session.messageType = 'success';
    res.redirect('/portal/collect-data');

  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/collect-data');
  }
};

exports.getSurveyDetails = async (req, res) => {
  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const { survey_id } = req.body;

  try {
    // Fetch survey record
    const [rows] = await db.query(
      `SELECT survey_id, county_name, sub_county_name, ward_name, enumerator_name, id_number, 
              worker_category, gender, age, education_level, received_training, received_certificate,
              facility_name, facility_classification, geo_location, year_established, total_children,
              girls, boys, age_under6, age_6_12, age_12_24, age_24_36, age_36_plus,
              children_with_disabilities, boys_with_disabilities, girls_with_disabilities,
              total_workers, female_workers, male_workers, workers_with_disabilities,
              member_institutions, loan_institutions, interested_in_finance, provider_name,
              phone_number, status, created_at
       FROM childcare_survey_tbl
       WHERE survey_id = ?
       LIMIT 1`,
      [survey_id]
    );

    if (rows.length === 0) {
      req.session.message = "Survey data not found for this record.";
      req.session.messageType = "error";
      return res.redirect('/portal/survey');
    }

    const surveyDetails = rows[0];

    // Store in session for the details page
    req.session.surveyDetails = surveyDetails;

    res.redirect('/portal/survey-details');

  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/portal/survey');
  }
};

exports.editSurveyStatus = async (req, res) => {

  const surveyId = req.params.survey_id;
  const { currentStatus, reason } = req.body;

  try {

    let newStatus;

    switch (currentStatus) {
      case 'Pending':
        newStatus = 'Active';
        break;
      case 'Active':
        newStatus = 'Inactive';
        break;
      case 'Inactive':
        newStatus = 'Active';
        break;
      default:
        req.session.message = 'Invalid status action.';
        req.session.messageType = 'error';
        return res.redirect('/portal/survey-details');
    }
    
    await db.execute(`UPDATE childcare_survey_tbl SET status = ? WHERE survey_id = ? LIMIT 1`,[newStatus, surveyId]);

    await logActivity(req.session.userId, null,'SURVEY_STATUS_UPDATE',`Changed survey status from ${currentStatus} to ${newStatus}. ${reason}`,req);

    req.session.message = `Survey status updated from ${currentStatus} to ${newStatus}.`;
    req.session.messageType = 'success';
    return res.redirect('/portal/survey-details');

  } catch (err) {
    console.error('Error updating survey status:', err);
    req.session.message = 'An error occurred while updating survey status.';
    req.session.messageType = 'error';
    return res.redirect('/portal/survey-details');
  }
};

exports.getEditSurveyDetails = async (req, res) => {
  if (!req.session.userId) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const surveyId = req.params.survey_id;

  try {
    // Fetch survey record
    const [rows] = await db.query(
      `SELECT survey_id, county_name, sub_county_name, ward_name, enumerator_name, id_number, 
              worker_category, gender, age, education_level, received_training, received_certificate,
              facility_name, facility_classification, geo_location, year_established, total_children,
              girls, boys, age_under6, age_6_12, age_12_24, age_24_36, age_36_plus,
              children_with_disabilities, boys_with_disabilities, girls_with_disabilities,
              total_workers, female_workers, male_workers, workers_with_disabilities,
              member_institutions, loan_institutions, interested_in_finance, provider_name,
              phone_number, status, created_at
       FROM childcare_survey_tbl
       WHERE survey_id = ?
       LIMIT 1`,
      [surveyId]
    );

    if (rows.length === 0) {
      req.session.message = "Survey data not found for this record.";
      req.session.messageType = "error";
      return res.redirect('/portal/survey');
    }

    const surveyDetails = rows[0];

    surveyDetails.member_institutions = surveyDetails.member_institutions 
      ? surveyDetails.member_institutions.split(',').map(i => i.trim()) 
      : [];

    surveyDetails.loan_institutions = surveyDetails.loan_institutions 
      ? surveyDetails.loan_institutions.split(',').map(i => i.trim()) 
      : [];

    req.session.surveyEdits = surveyDetails;

    res.redirect('/portal/edit-survey');

  } catch (error) {
    console.error('Error fetching survey details:', error);
    req.session.message = "An unexpected error occurred while fetching survey details.";
    req.session.messageType = "error";
    return res.redirect('/portal/survey');
  }
};

exports.updateSurveyData = async (req, res) => {

  if (!req.session.surveyEdits || !req.session.surveyEdits.survey_id) {
    req.session.message = "Session expired or invalid edit context. Please try again.";
    req.session.messageType = "error";
    return res.redirect('/portal/survey');
  }

  const { survey_id } = req.session.surveyEdits;
  try {
    const {
      countyName, subCountyName,wardName, idNumber, workerCategory, gender, age, educationLevel, receivedTraining, receivedCertificate, facilityName,
      facilityClassification, geoLocation, yearEstablished, totalChildren, girls, boys, age_under6, age_6_12, age_12_24, age_24_36, age_36_plus,
      children_with_disabilities, boys_with_disabilities, girls_with_disabilities, total_workers, female_workers, male_workers,
      workers_with_disabilities, member_institutions, loan_institutions, interested_in_finance, provider_name, phone_number } = req.body;

      const total_children = normalizeNumber(totalChildren);
      const t_girls = normalizeNumber(girls);
      const t_boys = normalizeNumber(boys);
      const under_6 = normalizeNumber(age_under6);
      const a_6_12 = normalizeNumber(age_6_12);
      const a_12_24 = normalizeNumber(age_12_24);
      const a_24_36 = normalizeNumber(age_24_36);
      const a_36_p = normalizeNumber(age_36_plus);
      const c_w_d = normalizeNumber(children_with_disabilities);
      const b_w_d = normalizeNumber(boys_with_disabilities);
      const g_w_d = normalizeNumber(girls_with_disabilities);
      const t_workers = normalizeNumber(total_workers);
      const f_worker = normalizeNumber(female_workers);
      const m_worker = normalizeNumber(male_workers);
      const w_w_d = normalizeNumber(workers_with_disabilities);

    const memberInstitutions = Array.isArray(member_institutions) ? member_institutions.join(', ') : member_institutions || null;
    const loanInstitutions = Array.isArray(loan_institutions) ? loan_institutions.join(', ') : loan_institutions || null;

    const query = `
      UPDATE childcare_survey_tbl SET county_name = ?, sub_county_name = ?, ward_name = ?, id_number = ?, worker_category = ?, gender = ?, age = ?, 
      education_level = ?, received_training = ?, received_certificate = ?, facility_name = ?, facility_classification = ?, geo_location = ?, 
      year_established = ?, total_children = ?, girls = ?, boys = ?, age_under6 = ?, age_6_12 = ?, age_12_24 = ?, age_24_36 = ?, age_36_plus = ?, 
      children_with_disabilities = ?, boys_with_disabilities = ?, girls_with_disabilities = ?, total_workers = ?, 
      female_workers = ?, male_workers = ?, workers_with_disabilities = ?, member_institutions = ?, loan_institutions = ?, interested_in_finance = ?, 
      provider_name = ?, phone_number = ?  WHERE survey_id = ? LIMIT 1`;

    const [editSurvey] = await db.execute(query, [
      countyName, subCountyName, wardName, idNumber, workerCategory, gender, age, educationLevel, receivedTraining, receivedCertificate,
      facilityName, facilityClassification, geoLocation, yearEstablished, total_children, t_girls, t_boys, under_6, a_6_12, a_12_24, a_24_36, a_36_p,
      c_w_d, b_w_d, g_w_d, t_workers, f_worker, m_worker, w_w_d, memberInstitutions, loanInstitutions, interested_in_finance, provider_name,
      phone_number, survey_id]);

      if (editSurvey.affectedRows > 0) {
        
      }

    req.session.message = 'Survey record updated successfully!';
    req.session.messageType = 'success';
    res.redirect('/portal/edit-survey');
  } catch (error) {
    console.error('Error updating survey:', error);
    req.session.message = 'Error updating record: ' + error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/survey');
  }
};


// -------------------------------------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------------------------------------

exports.saveSettingsDetails = async (req, res) => {

  const { saccoName, registrationNumber, contactEmail, contactPhone, address, membershipFee, loan_interest_default, savings_interest_rate, penalty_rate,
    max_loan_multiple, financial_year_start } = req.body;

    if (!saccoName || !contactEmail) {
      req.session.message = 'Sacco name and contact email are required.';
      req.session.messageType = 'error';
      return res.redirect('/portal/settings');
    }

  try {
    
    const [existing] = await db.query('SELECT setting_id FROM settings_tbl LIMIT 1');

    if (existing.length > 0) {
    
      const setting_id = existing[0].setting_id;
      const oldData = existing[0];

      await db.query(
        `UPDATE settings_tbl SET sacco_name=?, registration_number=?, contact_email=?, contact_phone=?, address=?, membership_fee = ?, 
             loan_interest_default=?, savings_interest_rate=?, penalty_rate=?, max_loan_multiple=?, 
             financial_year_start=?, updated_at = NOW() 
         WHERE setting_id=?`,
        [saccoName, registrationNumber, contactEmail, contactPhone, address, membershipFee, loan_interest_default, savings_interest_rate, penalty_rate, max_loan_multiple,
          financial_year_start, setting_id]);

      // Identify changes
      const changes = [];
        const newData = { sacco_name: saccoName, registration_number: registrationNumber, contact_email: contactEmail, contact_phone: contactPhone,
          address, membership_fee: membershipFee, loan_interest_default, savings_interest_rate, penalty_rate, max_loan_multiple, financial_year_start
        };

      for (const key in newData) {
        if (String(newData[key]) !== String(oldData[key])) {
          changes.push(`${key}: '${oldData[key] ?? ''}' → '${newData[key] ?? ''}'`);
        }
      }

      const logMessage =
        changes.length > 0
          ? `Settings updated. Changes: ${changes.join(', ')}`
          : 'Settings updated (no field values changed).';
      
        await logActivity(req.session.userId, null,'SETTINGS_UPDATE',`Organization details updated: ${logMessage}`,req);

      req.session.message = 'Organization settings updated successfully.';
      req.session.messageType = 'success';
      
    } else {
      await db.query(
        `INSERT INTO settings_tbl (sacco_name, registration_number, contact_email, contact_phone, address, membership_fee, loan_interest_default, savings_interest_rate, 
          penalty_rate, max_loan_multiple, financial_year_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ saccoName, registrationNumber, contactEmail, contactPhone, address, membershipFee, loan_interest_default, savings_interest_rate, penalty_rate,
          max_loan_multiple, financial_year_start ]);

      await logActivity(req.session.userId, null,'SETTINGS_ADDED',`Organization details created`,req);

      req.session.message = 'Organization settings saved successfully.';
      req.session.messageType = 'success';
    }

    res.redirect('/portal/settings');
  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/settings');
  }
};

exports.addLoanType = async (req, res) => {
  const { loan_name, interest_rate, max_term_months, min_amount, max_amount } = req.body;

  try {
    await db.query(
      `INSERT INTO loan_types_tbl (loan_name, interest_rate, max_term_months, min_amount, max_amount)
       VALUES (?, ?, ?, ?, ?)`,
      [loan_name, interest_rate, max_term_months, min_amount, max_amount]
    );

    await logActivity(req.session.userId, null, 'LOAN_TYPE_ADD', `Added loan type: ${loan_name}`, req);

    req.session.message = 'Loan type added successfully.';
    req.session.messageType = 'success';
    res.redirect('/portal/settings');
  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/settings');
  }
};

exports.updateLoanType = async (req, res) => {
  const { loan_type_id, loan_name, interest_rate, max_term_months, min_amount, max_amount } = req.body;

  try {

    const [existing] = await db.query('SELECT loan_type_id FROM loan_types_tbl LIMIT 1');

    if (existing.length > 0) {
    
      const oldData = existing[0];

      await db.query(
      "UPDATE loan_types_tbl SET loan_name=?, interest_rate=?, max_term_months=?, min_amount=?, max_amount=? WHERE loan_type_id=? LIMIT 1",
        [loan_name, interest_rate, max_term_months, min_amount, max_amount, loan_type_id]
      );

      const changes = [];
        const newData = { loan_name, interest_rate, max_term_months, min_amount, max_amount };

      for (const key in newData) {
        if (String(newData[key]) !== String(oldData[key])) {
          changes.push(`${key}: '${oldData[key] ?? ''}' → '${newData[key] ?? ''}'`);
        }
      }

      const logMessage =
        changes.length > 0
          ? `Loan Type updated. Changes: ${changes.join(', ')}`
          : 'Loan Type updated (no field values changed).';
      
        await logActivity(req.session.userId, null,'LOAN_TYPE_UPDATE',`Loan type details updated: ${logMessage}`,req);

        req.session.message = 'Loan type updated successfully.';
        req.session.messageType = 'success';
        res.redirect('/portal/settings');

    }
  } catch (error) {
    console.error(error);
    req.session.message = error.message;
    req.session.messageType = 'error';
    res.redirect('/portal/settings');
  }
};






