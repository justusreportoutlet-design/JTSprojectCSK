import { MonthlyScheduleState, ScheduleDayCell, LeaveRecord, Outlet } from '../types';

export interface ShiftTiming {
  code: string;
  inTime: string;  // e.g. "10:00"
  outTime: string; // e.g. "18:00"
  isWork: boolean;
  statusEquivalent?: string; // e.g. "OFF", "CUTI", "IZIN", "ALFA", "SAKIT_DOC"
}

export function getShiftTiming(shiftCode?: string): ShiftTiming | null {
  if (!shiftCode) return null;
  const upper = shiftCode.trim().toUpperCase();

  switch (upper) {
    case 'P1':
    case 'M85':
      return { code: 'P1', inTime: '08:00', outTime: '16:00', isWork: true };
    case 'P':
    case 'M96':
      return { code: 'P', inTime: '09:00', outTime: '17:00', isWork: true };
    case 'MD':
    case 'M1':
    case 'M10':
      return { code: 'MD', inTime: '10:00', outTime: '18:00', isWork: true };
    case 'MD1':
    case 'M2':
    case 'M11':
      return { code: 'MD1', inTime: '11:00', outTime: '19:00', isWork: true };
    case 'MD2':
    case 'M3':
    case 'M12':
      return { code: 'MD2', inTime: '12:00', outTime: '20:00', isWork: true };
    case 'S':
    case 'M13':
      return { code: 'S', inTime: '13:00', outTime: '21:00', isWork: true };
    case 'S1':
    case 'M14':
      return { code: 'S1', inTime: '14:00', outTime: '22:00', isWork: true };
    case 'FULL':
      return { code: 'FULL', inTime: '09:00', outTime: '23:00', isWork: true };
    case 'OFF':
      return { code: 'OFF', inTime: 'OFF', outTime: 'OFF', isWork: false, statusEquivalent: 'OFF' };
    case 'SICK':
    case 'SAKIT':
      return { code: 'SICK', inTime: 'SICK', outTime: 'SICK', isWork: false, statusEquivalent: 'SAKIT_DOC' };
    case 'IZIN':
      return { code: 'IZIN', inTime: 'IZIN', outTime: 'IZIN', isWork: false, statusEquivalent: 'IZIN' };
    case 'CUTI':
    case 'CT':
      return { code: 'CUTI', inTime: 'CUTI', outTime: 'CUTI', isWork: false, statusEquivalent: 'CUTI' };
    case 'ALPHA':
    case 'ALFA':
      return { code: 'ALPHA', inTime: 'ALPHA', outTime: 'ALPHA', isWork: false, statusEquivalent: 'ALFA' };
    case 'EO':
      return { code: 'EO', inTime: 'EO', outTime: 'EO', isWork: false, statusEquivalent: 'OFF' };
    default:
      // Custom shift format e.g. "08:00"
      if (/^\d{1,2}:\d{2}$/.test(upper)) {
        return { code: upper, inTime: upper, outTime: '17:00', isWork: true };
      }
      return { code: upper, inTime: '08:00', outTime: '17:00', isWork: true };
  }
}

/**
 * Searches for a staff member's schedule on a specific date in monthlySchedule.
 */
export function getStaffScheduleForDate(
  monthlySchedule: Record<string, MonthlyScheduleState> | undefined,
  outlet: string,
  staffId: string,
  dateStr: string,
  staffName?: string
): ScheduleDayCell | null {
  if (!monthlySchedule) return null;

  const normalizedName = staffName?.trim().toLowerCase();

  // Search all monthly schedule keys that match this outlet
  for (const key of Object.keys(monthlySchedule)) {
    if (!outlet || key.endsWith(`_${outlet}`) || key.includes(outlet)) {
      const state = monthlySchedule[key];
      if (state && state.schedules) {
        let staffRow = state.schedules[staffId];
        if (!staffRow) {
          for (const sKey of Object.keys(state.schedules)) {
            const row = state.schedules[sKey];
            if (
              sKey === staffId ||
              sKey.startsWith(`${staffId}_`) ||
              row?.staffId === staffId ||
              (normalizedName && row?.name && row.name.trim().toLowerCase() === normalizedName)
            ) {
              staffRow = row;
              break;
            }
          }
        }
        if (staffRow && staffRow.days && staffRow.days[dateStr]) {
          const cell = staffRow.days[dateStr];
          if (cell && (cell.shift || cell.ot !== undefined)) {
            return cell;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extracts all CUTI entries from monthlySchedule as LeaveRecord items.
 */
export function extractScheduleLeaveRecords(
  monthlySchedule?: Record<string, MonthlyScheduleState>
): LeaveRecord[] {
  if (!monthlySchedule) return [];

  const leaveRecords: LeaveRecord[] = [];
  const processedKeys = new Set<string>();

  Object.entries(monthlySchedule).forEach(([schedKey, schedState]) => {
    const parts = schedKey.split('_');
    const outletFromKey = parts.length > 1 ? (parts.slice(1).join('_') as Outlet) : undefined;

    if (!schedState || !schedState.schedules) return;

    Object.values(schedState.schedules).forEach((row) => {
      if (!row || !row.staffId || !row.days) return;

      Object.entries(row.days).forEach(([dateStr, cell]) => {
        if (!cell || !cell.shift) return;
        const shiftUpper = cell.shift.trim().toUpperCase();

        if (shiftUpper === 'CUTI' || shiftUpper === 'CT') {
          const dedupeKey = `${row.staffId}_${dateStr}`;
          if (!processedKeys.has(dedupeKey)) {
            processedKeys.add(dedupeKey);
            leaveRecords.push({
              id: `SCHED_${row.staffId}_${dateStr}`,
              staffId: row.staffId,
              outlet: outletFromKey,
              date: dateStr,
              startDate: dateStr,
              endDate: dateStr,
              totalDays: 1,
              reason: 'CUTI Schedule (Auto Sync)'
            });
          }
        }
      });
    });
  });

  return leaveRecords;
}

/**
 * Merges manual leave records with schedule leave records, avoiding duplicate dates for the same staff.
 */
export function getMergedLeaveRecords(
  manualRecords: LeaveRecord[] = [],
  monthlySchedule?: Record<string, MonthlyScheduleState>
): LeaveRecord[] {
  const scheduleRecords = extractScheduleLeaveRecords(monthlySchedule);
  if (scheduleRecords.length === 0) return manualRecords;

  const coveredDatesByStaff = new Map<string, Set<string>>();

  manualRecords.forEach(rec => {
    if (!rec.staffId) return;
    if (!coveredDatesByStaff.has(rec.staffId)) {
      coveredDatesByStaff.set(rec.staffId, new Set<string>());
    }
    const set = coveredDatesByStaff.get(rec.staffId)!;

    const startStr = rec.startDate || rec.date;
    const endStr = rec.endDate || rec.startDate || rec.date;

    if (startStr && startStr.length >= 10) {
      if (endStr && endStr.length >= 10 && startStr <= endStr) {
        let curr = new Date(startStr);
        const end = new Date(endStr);
        let safety = 0;
        while (curr <= end && safety < 366) {
          safety++;
          const dateIso = curr.toISOString().split('T')[0];
          set.add(dateIso);
          curr.setDate(curr.getDate() + 1);
        }
      } else {
        set.add(startStr.substring(0, 10));
      }
    }
  });

  const merged = [...manualRecords];
  scheduleRecords.forEach(schedRec => {
    const staffSet = coveredDatesByStaff.get(schedRec.staffId);
    if (!staffSet || !staffSet.has(schedRec.date)) {
      merged.push(schedRec);
    }
  });

  return merged;
}

