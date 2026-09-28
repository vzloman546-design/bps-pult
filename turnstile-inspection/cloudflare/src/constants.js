export const STATUS_OPTIONS = ['', 'Исправно', 'Требует обслуживания', 'Неисправно'];
export const COMPLETE_REMARK_STATUSES = new Set(['Требует обслуживания', 'Неисправно']);

export const GATE_CODES = {
  1: ['SRS.G1 ТДМГН1', ...Array.from({ length: 8 }, (_, i) => `SRS.G1 ТД${i + 1}`), 'SRS.G1 ТДМГН2'],
  2: ['SRS.G2 ТДМГН1', ...Array.from({ length: 18 }, (_, i) => `SRS.G2 ТД${i + 1}`), 'SRS.G2 ТДМГН2'],
  3: ['SRS.G3 ТДМГН1', ...Array.from({ length: 18 }, (_, i) => `SRS.G3 ТД${i + 1}`), 'SRS.G3 ТДМГН2'],
  4: ['SRS.G4 ТДМГН1', ...Array.from({ length: 18 }, (_, i) => `SRS.G4 ТД${i + 1}`), 'SRS.G4 ТДМГН2']
};

export function validGateNo(value) {
  return [1, 2, 3, 4].includes(Number(value));
}

export function checkIsComplete(row) {
  if (!row) return false;
  const required = ['visual', 'power', 'reader', 'final_status'];
  if (required.some(key => !String(row[key] || '').trim())) return false;
  if (COMPLETE_REMARK_STATUSES.has(row.final_status) && !String(row.remarks || '').trim()) return false;
  return true;
}
