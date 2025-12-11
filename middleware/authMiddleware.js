const secretKey = require('../generateKey');

const ALLOWED_ROLES = ['Admin', 'Data Clerk', 'Viewer', 'Champion', 'Member'];

// const pageAccessMap = {
//   'dashboard': ['Admin', 'Champion', 'Data Clerk', 'Viewer'],
//   'members': ['Admin', 'Champion', 'Data Clerk', 'Viewer'],
//   'add-member': ['Admin', 'Data Clerk', 'Champion'],
//   'draft': ['Admin', 'Data Clerk', 'Champion'],
//   'view-member': ['Admin', 'Data Clerk'],
//   'approval': ['Admin'],
//   'beneficiaries': ['Admin', 'Data Clerk'],
//   'add-beneficiary': ['Admin', 'Data Clerk'], 
//   'facilities': ['Admin', 'Data Clerk'],
//   'view-facility': ['Admin', 'Data Clerk'],
//   'add-facility': ['Admin', 'Data Clerk'],
//   'caregiver': ['Admin', 'Data Clerk'],
//   'add-caregiver': ['Admin', 'Data Clerk'],
//   'contributions': ['Admin', 'Data Clerk'],
//   'loans': ['Admin', 'Data Clerk'],
//   'sacco-member': ['Admin', 'Data Clerk'],
//   'sacco-details': ['Admin', 'Data Clerk'],
//   'profile': ['Admin', 'Data Clerk','Viewer', 'Champion'],
//   'settings': ['Admin'],
//   'details': ['Admin'],
//   'users': ['Admin'],
//   'analysis': ['Admin', 'Data Clerk', 'Viewer'],
//   'survey': ['Admin', 'Data Clerk', 'Viewer'],
//   'survey-details': ['Admin', 'Data Clerk'],
//   'collect-data': ['Admin', 'Data Clerk', 'Champion'],
//   'edit-survey': ['Admin'],
//   'reports': ['Admin'],
//   'view-user': ['Admin'],
//   'help': ['Admin', 'Champion', 'Data Clerk', 'Viewer'],
//   'profile-details': ['Member'],
//   'my-dashboard': ['Member'],
//   'my-profile': ['Member'],
//   'my-facility': ['Member'],
//   'my-facility-details': ['Member'],
//   'my-contributions': ['Member'],
//   'my-sacco': ['Member']
// };

module.exports = {
  
// Gen user session
  ensureAuthenticated: (req, res, next) => {
    if (!req.session || !req.session.userId) {
      req.session.message = 'Unauthorized user access declined.';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    // Now role and path available in all EJS files
    res.locals.userRole = req.session.user_role;

    res.locals.isAdmin = req.session.user_role === 'Admin';
    res.locals.isDataClerk = req.session.user_role === 'Data Clerk';
    res.locals.isChampion = req.session.user_role === 'Champion';
    res.locals.isViewer = req.session.user_role === 'Viewer';
    res.locals.isMember = req.session.user_role === 'Member';

    res.locals.currentPath = req.path;

    res.locals.hasAccess = (pageKey) => {
      const allowed = pageAccessMap[pageKey];
      return allowed ? allowed.includes(req.session.user_role) : false;
    };

    next();
  },

  ensureRole: (allowedRoles = ALLOWED_ROLES) => {
    return (req, res, next) => {
      const userRole = req.session.user_role;

    //   if has role
      if (!userRole) {
        req.session.message = 'Unauthorized access action denied.';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
      }

    //   is allowed role
      if (!ALLOWED_ROLES.includes(userRole)) {
        req.session.message = 'Invalid permission assigned to your account.';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
      }

    //   role for route
      if (!allowedRoles.includes(userRole)) {
        req.session.message = 'Access denied. You do not have permissions.';
        req.session.messageType = 'error';
        return res.redirect('/portal/dashboard');
      }

      next();
    };
  },

  ensureAccessKey: () => {
    return (req, res, next) => {
      if (!req.session || req.session.accessKey !== secretKey) {
        req.session.message = 'Invalid access detected.';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
      }
      next();
    };
  },
};
