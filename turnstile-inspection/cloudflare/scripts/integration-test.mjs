const base = process.env.TEST_API || 'http://127.0.0.1:8787';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('authorization', 'Bearer ' + options.token);
  if (options.json !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(base + path, {
    method: options.method || 'GET',
    headers,
    body: options.json === undefined ? options.body : JSON.stringify(options.json)
  });

  let payload = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (options.expect != null) {
    assert(response.status === options.expect, path + ': expected ' + options.expect + ', got ' + response.status + ' ' + JSON.stringify(payload));
  } else {
    assert(response.ok, path + ': HTTP ' + response.status + ' ' + JSON.stringify(payload));
  }

  return { response, payload };
}

async function main() {
  await call('/api/health');

  const bootstrap = await call('/api/bootstrap/admin', {
    method: 'POST',
    headers: { 'x-bootstrap-token': 'test-bootstrap-token' },
    json: {
      username: 'admin',
      displayName: 'Тестовый администратор',
      password: 'AdminPass123!'
    },
    expect: 201
  });
  assert(bootstrap.payload.user.role === 'admin', 'bootstrap admin role');

  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    json: { username: 'admin', password: 'AdminPass123!' }
  });
  const adminToken = adminLogin.payload.token;
  assert(adminToken, 'admin token missing');

  const employeeCreate = await call('/api/users', {
    method: 'POST',
    token: adminToken,
    json: {
      username: 'employee1',
      displayName: 'Тестовый сотрудник',
      password: 'Employee123!',
      role: 'inspector'
    },
    expect: 201
  });
  const employee = employeeCreate.payload.user;

  const inspectionCreate = await call('/api/inspections', {
    method: 'POST',
    token: adminToken,
    json: {
      title: 'CI осмотр 1 гейта',
      gates: [{ gateNo: 1, assigneeUserId: employee.id }]
    },
    expect: 201
  });
  const inspection = inspectionCreate.payload.inspection;
  assert(inspection.gates.length === 1, 'inspection must contain one gate');
  assert(inspection.gates[0].gateNo === 1, 'wrong gate');

  const employeeLogin = await call('/api/auth/login', {
    method: 'POST',
    json: { username: 'employee1', password: 'Employee123!' }
  });
  const employeeToken = employeeLogin.payload.token;

  const gate = (await call('/api/inspections/' + inspection.id + '/gates/1', {
    token: employeeToken
  })).payload.gate;

  assert(gate.checks.length === 10, 'gate 1 must have 10 turnstiles');
  assert(gate.readOnly === false, 'active assigned gate must be editable');

  for (let index = 0; index < gate.checks.length; index++) {
    const check = gate.checks[index];
    const result = await call(
      '/api/inspections/' + inspection.id +
      '/gates/1/checks/' + encodeURIComponent(check.code),
      {
        method: 'PATCH',
        token: employeeToken,
        json: {
          visual: 'Исправно',
          power: 'Исправно',
          reader: 'Исправно',
          status: 'Исправно',
          remarks: ''
        }
      }
    );

    if (index === gate.checks.length - 1) {
      assert(result.payload.inspectionStatus === 'completed', 'inspection must complete after last turnstile');
      assert(result.payload.documentVersion === 1, 'first document version must be 1');
    }
  }

  const adminInspection = (await call('/api/inspections/' + inspection.id, {
    token: adminToken
  })).payload.inspection;

  assert(adminInspection.status === 'completed', 'admin must see completed inspection');
  assert(adminInspection.document?.status === 'pending', 'completed inspection must create pending document');

  const employeeInspection = (await call('/api/inspections/' + inspection.id, {
    token: employeeToken
  })).payload.inspection;

  assert(employeeInspection.document === null, 'employee must not see shared document metadata');

  await call('/api/inspections/' + inspection.id + '/document', {
    token: employeeToken,
    expect: 403
  });

  const history = (await call('/api/history', {
    token: employeeToken
  })).payload.history;

  const own = history.find(item => item.id === inspection.id);
  assert(own, 'employee history must contain completed inspection');
  assert(own.gateNos.includes(1), 'employee history must include gate 1');

  const readOnlyGate = (await call('/api/inspections/' + inspection.id + '/gates/1', {
    token: employeeToken
  })).payload.gate;
  assert(readOnlyGate.readOnly === true, 'completed historical gate must be read-only');

  await call('/api/inspections/' + inspection.id + '/gates/1/reopen', {
    method: 'PATCH',
    token: adminToken,
    json: {}
  });

  const reopened = (await call('/api/inspections/' + inspection.id, {
    token: adminToken
  })).payload.inspection;

  assert(reopened.status === 'active', 'reopened inspection must be active');
  assert(reopened.gates[0].status === 'in_progress', 'reopened gate must be in progress');

  await call('/api/users/' + employee.id, {
    method: 'PATCH',
    token: adminToken,
    json: { active: false },
    expect: 409
  });

  await call('/api/inspections/' + inspection.id + '/cancel', {
    method: 'PATCH',
    token: adminToken,
    json: {}
  });

  await call('/api/users/' + employee.id, {
    method: 'PATCH',
    token: adminToken,
    json: { active: false }
  });

  console.log('integration-ok');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
