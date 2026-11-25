// shared/js/app/utils.js site addresses: pages live in folders (discover/, people/…), Rooms at the root.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { jsPath } from "../tools/js-files.mjs";

function load(href, protocol = "https:") {
  const root = href.slice(0, href.indexOf("/DormNamo/") + "/DormNamo/".length);
  const ctx = {
    location: { protocol, pathname: new URL(href).pathname },
    document: { currentScript: { src: root + "shared/js/app/utils.js" }, getElementById() {} },
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(jsPath("utils"), "utf8"), ctx);
  return (code) => vm.runInContext(code, ctx);
}

test("links point to the same addresses from the root page and from a page folder", () => {
  for (const at of ["https://ktens.me/DormNamo/", "https://ktens.me/DormNamo/discover/"]) {
    const run = load(at);
    assert.equal(run("SITE_ROOT"), "https://ktens.me/DormNamo/");
    assert.equal(run('pageUrl("home", "finder")'), "https://ktens.me/DormNamo/#finder");
    assert.equal(run('pageUrl("people", "me")'), "https://ktens.me/DormNamo/people/#me");
    assert.equal(run('pageUrl("listings", 5)'), "https://ktens.me/DormNamo/my-listings/#5");
    assert.equal(
      run('asset("img/area/msu-iit-gym.jpg")'),
      "https://ktens.me/DormNamo/img/area/msu-iit-gym.jpg",
    );
  }
});

test("asset() leaves data: and absolute addresses alone; index.html is the same page as its folder", () => {
  const run = load("https://ktens.me/DormNamo/people/");
  assert.equal(run('asset("data:image/jpeg;base64,AA")'), "data:image/jpeg;base64,AA");
  assert.equal(run('asset("https://example.org/a.jpg")'), "https://example.org/a.jpg");
  assert.equal(run('samePath("/DormNamo/", "/DormNamo/index.html")'), true);
  assert.equal(run('samePath("/DormNamo/discover/", "/DormNamo/")'), false);
});

test("opened from disk, links name index.html (file:// does not open a folder's index by itself)", () => {
  const run = load("file:///C:/site/DormNamo/discover/index.html", "file:");
  assert.equal(run('pageUrl("messages")'), "file:///C:/site/DormNamo/messages/index.html");
});
