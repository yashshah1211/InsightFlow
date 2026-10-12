# Build Battle 2026 submission checklist

## Source and deadline status

The user supplied these four required artifacts from **Problem_Statement.pdf**:
live deployed application, source code repository, short project demonstration,
and brief explanation of Adaption integration. The original PDF was not found
in the workspace/attachments checked; the requirement list is the user's provided
excerpt, not a claim that the entire PDF was independently reviewed.

[Organizer-listed Unstop event](https://unstop.com/hackathons/build-battle-frontend-arena-1755980/amp)
confirms Frontend Arena, individual participation, permitted AI-assisted work and
the expectation that participants understand their implementation. Its fetched
round text says seven hours; another indexed description and the project
blueprint say 48 hours. Only a registration cutoff, 3 October 2026 at 12:00 IST,
is visible. **That is not the project submission deadline.** Do not use the March
Codenbuild event with a similar name or calculate a deadline from duration.

- Exact submission deadline: **Awaiting organizer confirmation.**
- Submission timezone: **Awaiting organizer confirmation.**
- Submission URL/channel: **Awaiting organizer confirmation.**
- User's approximate 18-hour remaining window: planning estimate only, not verified.
- Video format/host/maximum length, repo visibility and additional form fields:
  **Awaiting organizer confirmation.** No inferred requirement is marked official.

## Required artifact readiness

| Required artifact | Deliverable / status |
| --- | --- |
| Live application | **Ready:** https://insightflow-preview-demo.vercel.app/; six public modules require no login; correctly labeled 10 synthetic records / 9 patterns / 1 repeat |
| Source repository | **Local source ready; GitHub URL pending.** README and sanitized publish snapshot prepared; publication needs explicit approval |
| Short demonstration | **Script ready:** [90-second walkthrough](DEMO_90_SECONDS.md). Actual recording/upload/video URL still required; no video is fabricated |
| Brief Adaption explanation | **Ready with limitation disclosure:** [status](ADAPTION_SUBMISSION_STATUS.md), [actual SDK connection proof](ADAPTION_CONNECTION_PROOF.json) and [architecture](SUBMISSION_ARCHITECTURE.md) |
| Real Adaption processing proof | **Not available:** no dataset/run/quote/output/evaluation. Connectivity is not a substitute if completed provider usage is required |

Do not paste a planned GitHub URL as an existing repository. Proposed location:
`yashshah1211/InsightFlow`, subject to explicit public approval and availability.
Do not tick the video item until a playable, access-checked recording exists.

## Safe GitHub publishing plan

1. Complete the documentation checkpoint on main; preserve all prior branches.
2. Prepare `submission/public-snapshot` as a new root commit from the reviewed
   tracked tree, excluding the four internal metadata files identified in the
   [audit](SUBMISSION_SECURITY_AUDIT.md). No old history, ignored files or worktree
   files enter that branch. Review its saved manifest and secret scan.
3. Obtain explicit approval before creating a **public** GitHub repository.
   No repository has been created by this packaging task.
4. After approval, create an empty `yashshah1211/InsightFlow` repository, with no
   automatic README/license/gitignore initialization. Publish only the snapshot.
   Do not push `--all`, `--mirror`, tags or main's historical refs. No force push.
5. Verify actual repository visibility, README links, snapshot file list and a
   fresh fixture build. Record the actual URL and published commit, then update
   this checklist. A private repo requires verified organizer access; do not
   assume a private link alone is sufficient.

Example commands **after approval and empty repository creation**:

```sh
git remote add submission https://github.com/yashshah1211/InsightFlow.git
git push submission submission/public-snapshot:main
```

These are instructions, not evidence that a remote/push exists. If a remote with
that name already exists, inspect it instead of overwriting it. Use authenticated
GitHub login/credential manager; never paste tokens into commands or chat. The
connector can inspect existing repositories, but exposes no repository-creation
operation; publishing may require the user's authenticated browser/Git setup.

## Judge access and final steps

- [x] Judges can explore Dashboard, Feedback, Issues, Decisions, Reports and Data
  Lab anonymously, including evidence, filters, simulations and public export.
- [x] Real hosted private flows have 32 historical acceptance checks; no new
  private writes/accounts are created during packaging.
- [ ] Record the prepared walkthrough with a pre-authenticated owner session;
  show existing authored private batches/actions without filming login or secrets.
- [ ] For live private judging, offer owner-operated screen sharing. If organizer
  rules demand hands-on login, arrange dedicated access through a private channel
  under separate approval. Never publish the existing test-account passwords.
- [ ] Publish the reviewed source after approval; verify the actual GitHub URL.
- [ ] Upload the real video to the permitted host, then test anonymous playback.
- [ ] Confirm the exact deadline, timezone, form and field requirements with the
  organizer. No message to organizers was sent by this task.
- [ ] Disclose that Adaption processing is incomplete. If completed usage is
  mandatory, obtain organizer guidance and separate billing/run approvals; do
  not launch it as a submission shortcut.
- [ ] Paste verified live/repository/video links and the honest integration
  explanation into the confirmed form. Review all fields and submit manually.
- [ ] Keep a receipt/screenshot of the actual submitted confirmation privately.

Preserve the current Preview, its read-only fallback and development security.
Do not promote production, enable paid services, upload official/gold data,
publish credentials or claim a model/accuracy improvement. The package is ready
for recording and reviewed source publication; final submission is not performed.
