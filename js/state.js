/* ==========================================================
   state.js - the signed-in user's preferences & interactions
   `S` is the single state object used by matching, the model
   and the swipe deck. It is saved per account via Accounts.
   ========================================================== */

// Default preferences. m = how strictly each one applies:
// 0 = don't care, 1 = preferred (affects ranking), 2 = must have (hard filter)
var DEF = {
  school: "MSU-IIT",
  maxKm: 1.5,
  bhMax: 6000,
  aptMax: 9000,
  cap: "2-3",
  gender: "any",
  m: {
    dist: 2,
    budget: 1,
    cap: 1,
    gender: 1,
    water: 1,
    elec: 1,
    env: 1,
    kit: 1,
    wifi: 1,
    space: 1,
    curfew: 1,
    vis: 1,
  },
};

// Ranking weight of each preference (your priority order, highest first).
var W = {
  dist: 9,
  budget: 8,
  cap: 7,
  gender: 7,
  water: 6,
  elec: 5,
  env: 4,
  kit: 3,
  wifi: 3,
  space: 2,
  curfew: 1,
  vis: 1,
};

// Human-readable labels.
var LBL = {
  dist: "Walking distance",
  budget: "Budget",
  cap: "Room capacity",
  gender: "Gender accommodation",
  water: "Reliable 24/7 water",
  elec: "Electricity in rent",
  env: "Clean, peaceful, safe",
  kit: "Kitchen / cooking area",
  wifi: "Wi-Fi / internet",
  space: "Spacious room",
  curfew: "No curfew",
  vis: "Visitors allowed",
};

var S = null; // current user's state (set by loadState)
var USER = null; // current user {id, name, email}

function loadState(user) {
  USER = user;
  S = Accounts.loadState(user.id) || {};
  S.P = S.P || JSON.parse(JSON.stringify(DEF));
  ["likes", "passes", "marks", "inq", "log", "hist"].forEach(function (k) {
    S[k] = S[k] || [];
  });
  S.views = S.views || {};
  if (!S.nn) initModel();
}

function save() {
  if (USER) Accounts.saveState(USER.id, S);
}
function byId(id) {
  return HOUSES.filter(function (h) {
    return h.id === id;
  })[0];
}

// Fresh, deterministic starting weights for the Two-Tower model.
function initModel() {
  var rand = lcg(7),
    i,
    j;
  S.nn = { Wu: [], Wd: [] };
  for (i = 0; i < H; i++) {
    S.nn.Wu.push([]);
    S.nn.Wd.push([]);
    for (j = 0; j < UD; j++) S.nn.Wu[i].push(rand() * 0.4);
    for (j = 0; j < DD; j++) S.nn.Wd[i].push(rand() * 0.4);
  }
}
