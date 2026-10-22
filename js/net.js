// Online matchmaking with no server of our own: waiting players meet in a public lobby on Nostr relays (Trystero), the
// pair is decided between them, then their browsers talk directly (WebRTC). Only the meeting uses the relays; anything
// that fails (no library, no relay, nobody waiting) resolves to null and the game falls back to a match against the AI.
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm';
  const APP = 'lastroyal-isinjia';
  const PROTO = 3; // bump when the match protocol changes: old and new builds never meet
  // a fixed list of relays known to answer: the library's default list includes relays that are down or have broken
  // certificates, and in-app browsers such as KakaoTalk's warn about every one of them
  const RELAYS = ['wss://nos.lol', 'wss://relay.mostro.network', 'wss://nostr-01.yakihonne.com', 'wss://relay.sigit.io', 'wss://schnorr.me', 'wss://yabu.me/v2', 'wss://nostr.data.haus', 'wss://strfry.shock.network']; // (from the library's own list: the ones that answer)
  let lib = null;
  async function load() { if (!lib) lib = await import(LIB); return lib; }

  // find(profile, ms) -> { guest, seed, foe, send(msg), listen(fn), close() } | null; cancel() stops a search
  let cancelFn = null, active = null; // active: the lobby this page is in (left before a new search)
  const leaveActive = () => { if (active) { try { active.leave(); } catch (e) { /* gone */ } active = null; } };
  function find(profile, ms) {
    return new Promise((resolve) => {
      let done = false, room = null, engaged = null, seed = 0, foe = null, inviteT = null;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); clearTimeout(inviteT); cancelFn = null; if (!v && room) { if (active === room) active = null; try { room.leave(); } catch (e) { /* gone */ } } resolve(v); };
      const timer = setTimeout(() => finish(null), ms);
      cancelFn = () => finish(null);
      load().then((L) => {
        if (done) return;
        const me = Object.assign({ v: PROTO }, profile);
        leaveActive();
        room = active = L.joinRoom({ appId: APP, relayConfig: { urls: RELAYS, warnOnRelayFailure: false } }, 'lobby-v' + PROTO);
        const hello = room.makeAction('hello'), invite = room.makeAction('invite'), accept = room.makeAction('accept'), game = room.makeAction('game');
        const say = () => hello.send(me);
        say();
        room.onPeerJoin = (pid) => { if (!done) hello.send(me, { target: pid }); };
        // the lower id invites, so two waiting players never invite each other at once
        hello.onMessage = (them, { peerId }) => {
          if (done || engaged || !them || them.v !== PROTO) return;
          if (L.selfId < peerId) {
            engaged = peerId; foe = them; seed = (Math.random() * 2147483647) | 0;
            invite.send({ seed, p: me }, { target: peerId });
            inviteT = setTimeout(() => { if (!done && engaged === peerId) { engaged = null; say(); } }, 4000); // no answer: free again
          }
        };
        invite.onMessage = (m, { peerId }) => {
          if (done || (engaged && engaged !== peerId) || !m || !m.p || m.p.v !== PROTO) return;
          engaged = peerId; accept.send({ p: me }, { target: peerId });
          link(true, m.seed, m.p, peerId);
        };
        accept.onMessage = (m, { peerId }) => { if (!done && engaged === peerId && m && m.p) link(false, seed, m.p, peerId); };
        // matched: a private line to the opponent (messages queue until the match is ready to hear them)
        function link(guest, sd, p, peerId) {
          let fn = null; const early = [];
          game.onMessage = (m, { peerId: from }) => { if (from !== peerId) return; if (fn) fn(m); else early.push(m); };
          room.onPeerLeave = (pid) => { if (pid !== peerId) return; const m = { bye: 1 }; if (fn) fn(m); else early.push(m); };
          finish({
            guest, seed: sd, foe: p,
            send: (m) => { try { game.send(m, { target: peerId }); } catch (e) { /* closing */ } },
            listen: (f) => { fn = f; while (early.length) f(early.shift()); },
            close: () => { if (active === room) active = null; try { room.leave(); } catch (e) { /* gone */ } },
          });
        }
      }).catch(() => finish(null));
    });
  }
  window.NET = { find, cancel: () => cancelFn && cancelFn() };
})();
