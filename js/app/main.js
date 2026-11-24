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
  // messages from landowners or students waiting: Namo points to them (not on the Messages page itself)
  var n = window.Inbox ? Inbox.unread() : 0;
  if (n && document.body.dataset.page !== "messages")
    Chat.notify(
      "You have <b>" +
        n +
        (n === 1 ? " new message" : " new messages") +
        '</b> in <a href="messages.html">Messages</a>.',
    );
}

function boot() {
  if (window.Consent && !Consent.asked()) return Consent.show(boot); // consent first, before anything is saved
  var user = Accounts.current();
  if (!user) return Auth.show(boot);
  loadState(user);
  if (!S.done)
    Onboarding.open({ onDone: startSite }); // first visit: ask preferences before anything else
  else startSite();
}
boot();
