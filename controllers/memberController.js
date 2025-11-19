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
const { notifyActivity } = require('../utils/notifier');


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

  return { county: countyName, subCounty: subCountyName, ward: wardName };
}

// ------------------------------------------------------------------------------------------------
// 1. ADD PROFILE DETAILS
// ------------------------------------------------------------------------------------------------

exports.getMemberLocation = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Session expired, try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  try {
    const { county, subCounty, ward } = req.body;

    if (!county || !subCounty || !ward) {
      req.session.message = "All fields are required!";
      req.session.messageType = "error";
      req.session.values = req.body;
      return res.redirect("/member/profile-details");
    }

    req.session.locationDetails = {
      county: county,
      sub_county: subCounty,
      ward: ward,
    };

    req.session.message = "Location updated successfully! Continue with Profile details.";
    req.session.messageType = "success";
    return res.redirect("/member/profile-details");

  } catch (err) {
    req.session.message = err.message;
    req.session.messageType = "error";
    return res.redirect("/member/profile-details");
  }
};

exports.addProfileDetails = async (req, res) => {

    if (!req.session.userMember || !req.session.locationDetails ) {
        req.session.message = 'Location not added, please try again!';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
    }
    const member_id = req.session.userMember;

    const { county, sub_county, ward } = req.session.locationDetails;

    const { phoneNumber, idNumber, dob, gender, disability, educationLevel, citizenship, country, kinName, kinRln, kinPhone, kinLocation } = req.body;


    const files = req.files || {};
    const basePath = `/uploads/documents/members/${member_id}`;
    const memberDoc = files.memberDoc ? `${basePath}/${files.memberDoc[0].filename}` : null;
    const memberIdDoc = files.memberIdDoc ? `${basePath}/${files.memberIdDoc[0].filename}` : null;

    try {
        const [profileCheck] = await db.query(`SELECT * FROM member_profile_tbl WHERE id_number = ? OR member_id = ? LIMIT 1`, [idNumber, member_id]);

        if (profileCheck.length > 0){ 

          req.session.message = 'A member with this National ID / Passport already added!';
          req.session.messageType = 'error';
          req.session.values = req.body;
          return res.redirect('/member/profile-details');
        }

      const [profileInsert] = await db.execute(`INSERT INTO member_profile_tbl(member_id, phone, id_number, dob, gender, disability, education_level, citizenship, country, county, 
        sub_county, ward, next_kin_name, kin_rln, kin_phone, kin_location, member_doc, member_id_doc) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          member_id, phoneNumber, idNumber, dob, gender, disability, educationLevel, citizenship, country, county, sub_county, ward, kinName, kinRln, kinPhone, kinLocation, memberDoc, memberIdDoc
        ]);
      
        if (profileInsert.affectedRows > 0) {

          await logActivity(req.session.userId, member_id, "MEMBER_ADDED_PROFILE", `Member added profile details: ${idNumber} (${gender}, ${county})`, req);

          req.session.message = 'Personal details added successfully!';
          req.session.messageType = 'success';
          req.session.values = req.body;
          return res.redirect('/member/profile-details');
        }
    } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/member/profile-details');
    }
};

exports.addFacilityDetails = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

    const memberId = req.session.userMember;

    const { facilityName, facilityType, setupType, yearStarted, registrationNumber, licenseNumber, maleB, femaleB, maleBD, femaleBD, maleC, femaleC} = req.body;

    const regNo = normalizeValue(registrationNumber);
    const licenseNo = normalizeValue(licenseNumber);
    
  try {
      const [profileCheck] = await db.query(`SELECT county, sub_county, ward FROM member_profile_tbl WHERE member_id = ? LIMIT 1`, [memberId]);

      if (profileCheck.length === 0) {
      req.session.message = "Complete your personal profile first.";
      req.session.messageType = "error";
      return res.redirect("/member/profile-details");
    }

      const location = profileCheck[0];

      const [facilityCheck] = await db.query(`SELECT * FROM facilities_tbl WHERE reg_no = ? OR license_no = ? LIMIT 1`, [regNo, licenseNo]);

        if (facilityCheck.length > 0){ 

          req.session.message = 'Facility with Registration / License Number already added!';
          req.session.messageType = 'error';
          req.session.values = req.body;
          return res.redirect('/member/profile-details');
        }

       const [rows] = await db.execute(`INSERT INTO facilities_tbl(member_id, facility_name, facility_type, setup_type, facility_estab_year, reg_no, license_no, male_b, female_b, 
        male_b_dis, female_b_dis, male_c, female_c, f_county, f_subcounty, f_area) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        memberId, facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, maleB, femaleB, maleBD, femaleBD, maleC, 
        femaleC, location.county, location.sub_county, location.ward
      ]);

      if (rows.affectedRows > 0) {
        await logActivity(req.session.userId, memberId, "MEMBER_ADDED_FACILITY", `Member facility details created`, req);
        req.session.message = 'Facility details added successfully!';
        req.session.messageType = 'success';
        return res.redirect('/member/profile-details');
      }

  } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/member/profile-details');
  }
};

exports.addBenefitsDetails = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = "Session expired, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const member_id = req.session.userMember;

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
        return res.redirect("/member/profile-details");
      }

      await db.query(
        `INSERT INTO benefits_tbl (member_id, benefits) VALUES (?, ?)`,
        [member_id, JSON.stringify(benefitsJson)]
      );

    await logActivity(req.session.userId, member_id, "MEMBER_BENEFITS_CREATED", `New member benefits details created`, req);

    req.session.message = "Benefits successfully saved!";
    req.session.messageType = "success";
    return res.redirect("/member/profile-details");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/member/profile-details");
  }
};

exports.memberDetailsConfirm = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = "Session expired, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  try {

      const memberId = req.session.userMember;

      await db.execute(`UPDATE members_tbl SET status = ? WHERE member_id = ? LIMIT 1`, ['Pending', memberId]);

      await notifyActivity(req.session.userId, 'Admin', 'Member Registration', `New member has submitted details for approval.`, req);


      req.session.message = "Details successfully saved!";
      req.session.messageType = "success";
      return res.redirect("/portal/dashboard");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/member/profile-details");
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

// ---------------------------------------------------------------------------------------------
// PROFILE
// --------------------------------------------------------------------------------------------

exports.userChangePassword = async (req, res) => {

    const user_id = req.session.userId;

    const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.session.message = 'All fields are required!';
      req.session.messageType = 'error';
      return res.redirect('/member/my-profile');
    }

    if (newPassword !== confirmPassword) {
      req.session.message = 'Passwords do not match!';
      req.session.messageType = 'error';
      return res.redirect('/member/my-profile');
    }

    if (newPassword.length < 8) {
      req.session.message = 'Password must be at least 8 characters long!';
      req.session.messageType = 'error';
      return res.redirect('/member/my-profile');
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
      return res.redirect('/member/my-profile');
    }

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      req.session.message = 'New password must be different from the old one!';
      req.session.messageType = 'error';
      return res.redirect('/member/my-profile');
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

exports.updateMemberProfile = async (req, res) => {
  if (!req.session.userMember) {
    req.session.message = "Unable to complete your request, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const member_id = req.session.userMember;

  const {
    phoneNumber,
    idNumber,
    dob,
    gender,
    disability,
    educationLevel,
    citizenship,
    county,
    subCounty,
    ward,
    kinName,
    kinRln,
    kinPhone,
    kinLocation
  } = req.body;

  try {
    const [oldRows] = await db.query(
      "SELECT * FROM member_profile_tbl WHERE member_id = ? LIMIT 1",
      [member_id]
    );

    const oldData = oldRows[0] || {};

    const [duplicateCheck] = await db.query(
      `SELECT * FROM member_profile_tbl 
       WHERE (id_number = ? OR phone = ?) AND member_id != ? LIMIT 1`,
      [idNumber, phoneNumber, member_id]
    );

    if (duplicateCheck.length > 0) {
      req.session.message = "A member with this National ID or phone number already exists!";
      req.session.messageType = "error";
      req.session.values = req.body;
      return res.redirect("/member/my-profile");
    }

    await db.execute(
      `UPDATE member_profile_tbl SET 
          phone = ?, id_number = ?, dob = ?, gender = ?, disability = ?, 
          education_level = ?, county = ?, sub_county = ?, ward = ?, 
          next_kin_name = ?, kin_rln = ?, kin_phone = ?, kin_location = ? 
       WHERE member_id = ? LIMIT 1`,
      [
        phoneNumber, idNumber, dob, gender, disability, educationLevel,
        county, subCounty, ward, kinName, kinRln, kinPhone, kinLocation,
        member_id
      ]
    );

    let changes = [];

    const newData = {
      phone: phoneNumber,
      id_number: idNumber,
      dob,
      gender,
      disability,
      education_level: educationLevel,
      county,
      sub_county: subCounty,
      ward,
      next_kin_name: kinName,
      kin_rln: kinRln,
      kin_phone: kinPhone,
      kin_location: kinLocation
    };

    for (let key in newData) {
      if (String(oldData[key]) !== String(newData[key])) {
        changes.push(`${key}: '${oldData[key] || "-"}' → '${newData[key]}'`);
      }
    }

    const changeSummary =
      changes.length > 0 ? changes.join(", ") : "No changes detected";

    await logActivity(
      req.session.userId,
      member_id,
      "MEMBER_UPDATED_PROFILE",
      `Updated fields: ${changeSummary}`,
      req
    );

    req.session.message = "Member details updated successfully!";
    req.session.messageType = "success";
    return res.redirect("/member/my-profile");
  } catch (error) {
    console.error("PROFILE_UPDATE_ERROR:", error);
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/member/my-profile");
  }
};

exports.updateMemberBenefits = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = "Unable to complete your request, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const member_id  = req.session.userMember;

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
    return res.redirect("/member/my-profile");

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect("/member/my-profile");
  }
};

exports.memberAddFacility = async (req, res) => {

  if (!req.session.userId || !req.session.userMember) {
    req.session.message = 'Session expired, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }

  const member_id = req.session.userMember;

    const { facilityName, facilityType, setupType, yearStarted, registrationNumber, licenseNumber, county, subCounty, ward, maleB, femaleB, maleBD, femaleBD, maleC, femaleC } = req.body;
    
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
        `SELECT * FROM facilities_tbl WHERE (reg_no = ? OR license_no = ?) AND member_id != ? LIMIT 1`,
        [regNo, licenseNo, member_id]
      );

      if (duplicateCheck.length > 0) {
        req.session.message = 'A facility with this Registration or License number already exists!';
        req.session.messageType = 'error';
        req.session.values = req.body;
        return res.redirect('/member/my-facility');
      }

        await db.execute(`INSERT INTO facilities_tbl(member_id, facility_name, facility_type, setup_type, facility_estab_year, reg_no, license_no, male_b, female_b, 
          male_b_dis, female_b_dis, male_c, female_c, f_county, f_subcounty, f_area) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          member_id, facilityName, facilityType, setupType, yearStarted, regNo, licenseNo, male_b, female_b, male_b_dis, female_b_dis, male_c, female_c, county, subCounty, ward
      ]);

      await logActivity(req.session.userId, member_id, "MEMBER_ADDED_FACILITY", `Member added new facility details`, req);

      req.session.message = 'Facility details added successfully!';
      req.session.messageType = 'success';
      return res.redirect('/member/my-facility');

  } catch (error) {
      req.session.message = error.message;
      req.session.messageType = "error";
      return res.redirect('/member/my-facility');
  }
};

exports.getFacilityDetails = async (req, res) => {

  const { facility_id } = req.body;

  try {

    req.session.facilityDetails = facility_id;

    res.redirect('/member/my-facility-details');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/member/my-facility');
  }
};

exports.updateFacilityDetails = async (req, res) => {

  if (!req.session.facilityDetails) {
    req.session.message = 'Unable to complete your update request, please try again!';
    req.session.messageType = 'error';
    return res.redirect('/member/my-facility');
  }

    const facilityId  = req.session.facilityDetails;
    const memberId = req.session.userMember;

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
          return res.redirect('/member/my-facility-details');
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
        return res.redirect('/member/my-facility-details');
    }

    const [checkFacility] = await db.query(`SELECT reg_no, license_no FROM facilities_tbl WHERE reg_no IS NOT NULL AND 
      license_no IS NOT NULL AND facility_id = ? LIMIT 1`, [facilityId]);

    if (checkFacility.length === 0) {
        req.session.message = 'Unable to complete your request. Your facility is missing Registration & License Number!';
        req.session.messageType = 'error';
        return res.redirect('/member/my-facility-details');
    }

    const row = facilityCheck[0];

    await logActivity(req.session.userId, null,'REQUESTED_FACILITY_STATUS_UPDATE',`To Changed facility status from ${currentStatus} to ${newStatus}. ${reason}`,req);

    await notifyActivity(req.session.userId, 'Admin', 'Facility Update', `Member has requested for facility update from ${currentStatus} to ${newStatus}. submitted details for approval. Facility Reg: ${row.reg_no} and License: ${row.license_no}. Reason: ${reason}`, req);

    req.session.message = `Facility status updated request from ${currentStatus} to ${newStatus} has been sent.`;
    req.session.messageType = 'success';
    return res.redirect('/member/my-facility-details');

  } catch (err) {
    console.error('Error requesting facility status update:', err);
    req.session.message = 'An error occurred while requesting update of facility status.';
    req.session.messageType = 'error';
    return res.redirect('/member/my-facility-details');
  }
};

exports.confirmSaccoMemberAdd = async (req, res) => {

  if (!req.session.userMember) {
    req.session.message = "Unable to complete your request, please try again!";
    req.session.messageType = "error";
    return res.redirect("/auth/login");
  }

  const memberId = req.session.userMember;

  try {

    const [profile] = await db.query(
      `SELECT membership_no FROM members_tbl WHERE member_id = ? LIMIT 1`,
      [memberId]
    );

    if (profile.length === 0) {
      req.session.message = "Profile data not found for this member";
      req.session.messageType = "error";
      return res.redirect('/member/my-dashboard');
    }
    const membershipNo = profile[0].membership_no;

    const [checkSacco] = await db.query(`SELECT * FROM sacco_members_tbl WHERE member_id = ?  LIMIT 1`, [memberId]);

    if (checkSacco.length > 0) {
      req.session.message = "This member already added to sacco";
      req.session.messageType = "error";
      return res.redirect('/member/my-dashboard');
    }

    await db.execute(
        `INSERT INTO sacco_members_tbl (member_id, membership_no, shares, savings, loan_balance, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [memberId, membershipNo, 0, 0, 0, 'Active']);

    await logActivity(req.session.userId, memberId, "MEMBER_JOINED_SACCO", `New member has joined sacco with membership number ${membershipNo}`, req);

    req.session.message = "You have been added to sacco successfully! Check Sacco Tab";
    req.session.messageType = "success";
    res.redirect('/member/my-dashboard');

  } catch (error) {
    req.session.message = error.message;
    req.session.messageType = "error";
    return res.redirect('/member/my-dashboard');
  }
};

exports.addContribution = async (req, res) => {
  try {
    const { loan_id, sacco_member_id, contribution_type, amount, payment_method, reference_no, remarks } = req.body;

    if (!sacco_member_id || !contribution_type || !amount || !payment_method) {
      req.session.message = "All required fields must be filled!";
      req.session.messageType = "error";
      return res.redirect('/member/my-sacco');
    }

    if (amount <= 0) {
      req.session.message = "Amount must be greater than zero!";
      req.session.messageType = "error";
      return res.redirect('/member/my-sacco');
    }

    const [memberCheck] = await db.query(`SELECT member_id FROM sacco_members_tbl WHERE sacco_member_id = ? LIMIT 1`, [sacco_member_id]);
    if (memberCheck.length === 0) {
      req.session.message = "Invalid member selected!";
      req.session.messageType = "error";
      return res.redirect('/member/my-contributions');
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
            return res.redirect('/member/my-sacco');
          }

        const balance = parseFloat(loan[0].balance);
        const repayment = parseFloat(amount);

        if (repayment > balance) {
            req.session.message = 'Repayment cannot exceed current loan balance.';
            req.session.messageType = 'error';
            return res.redirect('/member/my-sacco');
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
    res.redirect('/member/my-sacco');

  } catch (error) {
    console.error('Contribution add error:', error);
    req.session.message = "Server error while recording contribution!";
    req.session.messageType = "error";
    res.redirect('/member/my-sacco');
  }
};