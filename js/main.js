/* ==========================================================
   main.js - start-up flow on every page
   log in / sign up -> preference questionnaire -> page
   Pages can define `pageInit()` (home, discover) and `draw()`.
   ========================================================== */
function startSite() {
  Nav.account();
  FX.reveal();
  if (window.HeroFX) HeroFX.play(); // Rooms page intro (index.html)
  FX.glideAfterLoad(window.HeroFX ? 900 : 150); // e.g. "List your place" clicked on Discover
  var edit = document.getElementById("dPref");
  if (edit) edit.onclick = prefs;
  if (window.Hearts) Hearts.syncAll();
  if (window.pageInit) pageInit();
  Chat.init();
}

function boot() {
  var user = Accounts.current();
  if (!user) return Auth.show(boot);
  loadState(user);
  if (!S.done)
    Onboarding.open({ onDone: startSite }); // first visit: ask preferences before anything else
  else startSite();
}
boot();
