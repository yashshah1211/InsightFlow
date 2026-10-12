import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Called only with ordinary user JWTs. All attempted imports must roll back.
export async function verifyRejectedImports({ url, key, users, runId }) {
  assert.equal(new globalThis.URL(url).hostname, 'dbacbcbglbqmqwxscesu.supabase.co');
  const tables = ['workspaces', 'import_batches', 'feedback', 'feedback_patterns', 'annotations', 'issues', 'issue_evidence', 'actions', 'adaption_runs'];
  async function request(user, path, body, status = 200) {
    const response = await globalThis.fetch(url + '/rest/v1/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: globalThis.AbortSignal.timeout(30000),
    });
    assert.equal(response.status, status, 'Controlled rejected-import HTTP status');
    return response.json();
  }
  async function rows(user) {
    const result = {};
    for (const table of tables) result[table] = await request(user, table + '?select=*&order=' + (table === 'feedback_patterns' ? 'normalized_hash' : table === 'issue_evidence' ? 'issue_id,normalized_hash' : 'id'));
    return result;
  }
  const results = [];
  for (const [user, foreign] of [[users[0], users[1]], [users[1], users[0]]]) {
    const before = await rows(user), foreignBefore = await rows(foreign);
    const records = before.feedback.filter(record => record.import_batch_id === user.batchId).map(record => record.contract_json);
    assert.equal(records.length, 4);
    const patterns = before.feedback_patterns.filter(pattern => pattern.import_batch_id === user.batchId).map(pattern => ({
      kind: 'pattern', batchId: user.batchId, normalizedHash: pattern.normalized_hash, normalizedText: pattern.normalized_text,
      exampleOriginalText: pattern.example_original_text, occurrenceCount: pattern.occurrence_count, categoryCounts: pattern.category_counts,
      annotation: records.find(record => record.normalizedHash === pattern.normalized_hash).annotation,
    }));
    function payload(batchId) {
      return { batchId, filename: runId + '-rollback.csv', source: 'upload', contentHash: createHash('sha256').update(randomUUID()).digest('hex'), rejectedRows: [], issues: [],
        records: records.map(record => ({ ...record, id: randomUUID(), batchId })), patterns: patterns.map(pattern => ({ ...pattern, batchId })),
      };
    }
    // A valid owned import cannot reuse B's existing globally unique batch UUID.
    const conflict = await request(user, 'rpc/import_feedback_batch', { p_payload: payload(foreign.batchId) }, 409);
    assert.equal(conflict.code, '23505');
    // Client-supplied owner/workspace authorization is not accepted by the RPC.
    const injection = await request(user, 'rpc/import_feedback_batch', { p_payload: { ...payload(randomUUID()), owner_id: foreignBefore.workspaces[0].owner_id } }, 400);
    assert.equal(injection.code, '22023');
    // Insert batch, patterns, annotations and records, then fail frequency validation.
    // Compare complete owner-visible rows to prove the transaction rolled back, not just pre-validation.
    const rolledBackBatchId = randomUUID(), badHistogram = payload(rolledBackBatchId);
    badHistogram.patterns[0].occurrenceCount++;
    const rollback = await request(user, 'rpc/import_feedback_batch', { p_payload: badHistogram }, 400);
    assert.equal(rollback.code, '22023');
    assert.equal(rollback.message, 'Pattern count mismatch');
    assert.deepEqual(await rows(user), before); assert.deepEqual(await rows(foreign), foreignBefore);
    results.push({ user: user.label, foreignBatchCollision: { status: 409, code: '23505' }, ownerInjection: { status: 400, code: '22023' },
      lateTransactionalFailure: { status: 400, code: '22023', rolledBackBatchId }, allNineOwnAndForeignTableRowsUnchanged: true });
  }
  return results;
}
