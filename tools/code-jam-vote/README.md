# Code Jam voting

Use this standalone app for the Nov 23 audience favorite and the official prize after the second Code Jam. Create one poll per vote. Each poll has its own link, QR code, codes and tally.

## Rehearse locally

1. Run `npm ci` from this folder.
2. Generate a local host key with `openssl rand -hex 32`. Set `POLL_HOST_KEY` to that value in `.dev.vars`. Keep the file private.
3. Run `npm run dev`. Open <http://127.0.0.1:8787/host.html> and enter your host key.
4. Create a sample poll. Generate two codes, save two projects and open voting. Use two devices or tabs to vote. Try a code twice, then close the poll and check the tally.

For a two-phone rehearsal on a trusted Wi-Fi network, run `npm run dev -- --ip 0.0.0.0` with a test key. Open the host page using the laptop's LAN address so the QR code points to an address the phones can reach.

With the local Worker running, set `POLL_TEST_HOST_KEY` to the local host key and run `npm test`. The check creates two sample ballots and verifies that one code cannot cast two votes or cross ballots. Set `POLL_TEST_URL` if you used a different local port.

## Run the votes

1. Use an HTTPS deployment of this Worker for the event. Set a fresh `POLL_HOST_KEY` as a Cloudflare secret. Keep the host page and key with the organizers.
2. At each event, open `/host.html` and enter the poll title. Save the host link for that poll.
3. Generate and download enough codes for everyone voting. Give each attendee one code in private. Save the batch before reloading the host page. Attendees do not need a Discord account.
4. Share the voter link in Discord or show the QR code. Use the voter page on the projector. The host page displays private codes.
5. Save the 2 to 50 eligible projects before voting. Select **Open voting** after the demos to lock the project list. When voting ends, select **Close and show results**. The voter page reveals the aggregate tally and flags ties.
6. Create a fresh poll and issue fresh codes for the second jam's prize. Agree on eligibility and how to handle ties before voting opens.

Codes are single use and specific to one poll. Anyone who receives a code can use it. The app stores a hash and whether the code was used, plus aggregate vote counts. It does not collect voter names or store which project a code voted for.
