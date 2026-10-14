import React, { useState, useMemo, useRef } from "react";
import { AppState, OvertimeEntry, Staff } from "../types";
import { sortStaff, getCutoffYearAndMonth, isStaffVisibleAtOutlet } from "../lib/staffUtils";
import { getStaffScheduleForDate, getShiftTiming } from "../lib/scheduleUtils";
import { OT_RATE } from "../constants";
import { toLocalDateStr } from "../lib/dateUtils";
import { motion, AnimatePresence } from "motion/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { safeWindow, safeNavigator } from "../lib/safeStorage";

export const getExtraHoursFromNotes = (notesStr?: string): number => {
  if (!notesStr) return 0;
  let extra = 0;

  const parts = notesStr.split("-").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const isTraining = part.toLowerCase().includes("training");
    const isGC = part.toLowerCase().includes("gc");

    if (isTraining) {
      const match = part.match(/Training\s*\(?([0-9\.,]+)?\s*J?a?m?\)?/i);
      if (match && match[1]) {
        const val = parseFloat(match[1].replace(",", "."));
        if (!isNaN(val)) {
          extra += val;
        } else {
          extra += 1;
        }
      } else {
        extra += 1;
      }
    } else if (isGC) {
      const match = part.match(/GC\s*\(?([0-9\.,]+)?\s*J?a?m?\)?/i);
      if (match && match[1]) {
        const val = parseFloat(match[1].replace(",", "."));
        if (!isNaN(val)) {
          extra += val;
        } else {
          extra += 1;
        }
      } else {
        extra += 1;
      }
    }
  }

  return extra;
};

const StaffInputRow: React.FC<{
  staff: Staff;
  date: string;
  outlet?: string;
  calculateOT: (inTime: string, outTime: string, brk: number, notesStr?: string) => any;
  onUpdate: (data: Partial<AppState>) => void;
  data: AppState;
}> = ({ staff, date, outlet, calculateOT, onUpdate, data }) => {
  const [inTime, setInTime] = useState("08:00");
  const [outTime, setOutTime] = useState("17:00");
  const [brk, setBrk] = useState(0);
  const [notes, setNotes] = useState("");
  const [trainingHours, setTrainingHours] = useState<number | "">(1);
  const [gcHours, setGcHours] = useState<number | "">(1);
  const [isSaved, setIsSaved] = useState(false);

  const removeTag = (str: string, tag: "Training" | "GC") => {
    const regex = new RegExp(`(?:\\s*-\\s*)?${tag}(?:\\s*\\(?[0-9\\.,]*\\s*J?a?m?\\)?)?`, "gi");
    return str.replace(regex, "").trim();
  };

  const existingEntry = (data.dailyOvertime?.[date] || []).find(
    (e) => e.staffId === staff.staffId && (!outlet || e.outlet === outlet),
  );

  const breakEntry = (data.dailyBreakTime?.[date] || []).find(
    (e) => e.staffId === staff.staffId && (!outlet || e.outlet === outlet),
  );

  const schedCell = useMemo(() => {
    return getStaffScheduleForDate(data.monthlySchedule, outlet || staff.outlet || '', staff.staffId, date, staff.name);
  }, [data.monthlySchedule, outlet, staff.outlet, staff.staffId, staff.name, date]);

  const shiftTiming = useMemo(() => {
    return getShiftTiming(schedCell?.shift);
  }, [schedCell?.shift]);

  const attendanceStatus = useMemo(() => {
    const att = (data.dailyAttendance?.[date] || []).find(
      (a) => a.staffId === staff.staffId,
    );
    if (att) return att.status;

    // Fallback to leaveRecords
    const isOnLeave = (data.leaveRecords || []).some((lr) => {
      if (lr.staffId !== staff.staffId) return false;
      if (!lr.startDate || !lr.endDate) return lr.date === date;
      return date >= lr.startDate && date <= lr.endDate;
    });
    if (isOnLeave) return "CUTI";
    return null;
  }, [data.dailyAttendance, data.leaveRecords, staff.staffId, date]);

  const isFrozen = useMemo(() => {
    if (shiftTiming && !shiftTiming.isWork) return true;
    return (
      attendanceStatus === "OFF" ||
      attendanceStatus === "CUTI" ||
      attendanceStatus === "IZIN" ||
      attendanceStatus === "ALFA" ||
      attendanceStatus === "SAKIT_DOC" ||
      attendanceStatus === "SAKIT_NO_DOC"
    );
  }, [attendanceStatus, shiftTiming]);

  React.useEffect(() => {
    const effectiveBreak = breakEntry?.totalBreakHours !== undefined ? breakEntry.totalBreakHours : (existingEntry?.breakTime ?? 0);
    if (existingEntry) {
      setInTime(existingEntry.clockIn);
      setOutTime(existingEntry.clockOut);
      setBrk(effectiveBreak);
      setNotes(existingEntry.notes || "");
    } else if (shiftTiming && shiftTiming.isWork) {
      setInTime(shiftTiming.inTime);
      setOutTime(shiftTiming.outTime);
      setBrk(effectiveBreak);
      setNotes("");
    } else {
      setInTime("08:00");
      setOutTime("17:00");
      setBrk(effectiveBreak);
      setNotes("");
    }
  }, [existingEntry, staff.staffId, date, shiftTiming, breakEntry]);

  const previewOT = useMemo(() => {
    return calculateOT(inTime, outTime, brk, notes);
  }, [calculateOT, inTime, outTime, brk, notes]);

  const handleSave = () => {
    if (isFrozen) return; // Prevent saving for frozen staff

    const { totalHours, overtimeHours, overtimePay } = calculateOT(
      inTime,
      outTime,
      brk,
      notes,
    );
    const newEntry: OvertimeEntry = {
      id: existingEntry?.id || `${Date.now()}_${staff.staffId}`,
      staffId: staff.staffId,
      outlet: outlet as any,
      date,
      clockIn: inTime,
      clockOut: outTime,
      breakTime: brk,
      totalHours,
      overtimeHours,
      overtimePay,
      notes,
    };

    const updatedDailyOT = { ...data.dailyOvertime };
    const dayEntries = updatedDailyOT[date] || [];
    // Remove if exists then add
    updatedDailyOT[date] = [
      ...dayEntries.filter((e) => e.staffId !== staff.staffId),
      newEntry,
    ];

    onUpdate({ dailyOvertime: updatedDailyOT });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <tr
      className={`transition-colors duration-300 ${isFrozen ? "bg-slate-950/40 opacity-45 border-dashed border-white/5" : existingEntry ? "bg-blue-500/5" : "hover:bg-white/5"}`}
    >
      <td className="p-4 px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`text-[11px] font-black uppercase truncate transition-all duration-300 ${isFrozen ? "text-slate-500 line-through decoration-red-500/50" : "text-white"}`}
            title={staff.name}
          >
            {staff.name}
          </div>
          {schedCell?.shift && (
            <span className="text-[7.5px] px-2 py-0.5 rounded font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shrink-0">
              <i className="fas fa-calendar-alt text-indigo-400"></i> SHIFT: {schedCell.shift} {shiftTiming?.isWork ? `(${shiftTiming.inTime}-${shiftTiming.outTime})` : ''}
            </span>
          )}
          {breakEntry && (breakEntry.totalBreakMinutes || 0) > 0 && (
            <span className="text-[7.5px] px-2 py-0.5 rounded font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0" title={`Break 1: ${breakEntry.break1Out || '-'}-${breakEntry.break1In || '-'}, Break 2: ${breakEntry.break2Out || '-'}-${breakEntry.break2In || '-'}`}>
              <i className="fas fa-mug-hot text-amber-400"></i> BREAK: {breakEntry.totalBreakHours} JAM ({breakEntry.totalBreakMinutes} MNT)
            </span>
          )}
          {isFrozen ? (
            <span className="text-[7.5px] px-2 py-0.5 rounded font-black uppercase bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 shrink-0">
              <i className="fas fa-snowflake text-sky-400"></i> BEKUKAN ({attendanceStatus === "SAKIT_DOC" ? "SICK (S)" : attendanceStatus === "SAKIT_NO_DOC" ? "SICK (TS)" : attendanceStatus === "ALFA" ? "ALFA" : attendanceStatus})
            </span>
          ) : (
            attendanceStatus &&
            attendanceStatus !== "HADIR" &&
            attendanceStatus !== "PH" && (
              <span
                className={`text-[7px] px-1.5 py-0.5 rounded font-black uppercase ${
                  attendanceStatus === "CUTI"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : attendanceStatus === "IZIN"
                      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      : "bg-slate-800 text-slate-400"
                }`}
              >
                {attendanceStatus === "SAKIT_DOC"
                  ? "SICK (S)"
                  : attendanceStatus === "SAKIT_NO_DOC"
                    ? "SICK (TS)"
                    : attendanceStatus === "ALFA"
                      ? "ALFA"
                      : attendanceStatus}
              </span>
            )
          )}
        </div>
        <div className={`text-[8px] font-bold uppercase mt-0.5 ${isFrozen ? "text-slate-600" : "text-slate-500"}`}>
          {staff.role}
        </div>
      </td>
      <td className="p-4 text-center">
        <input
          type="time"
          disabled={true}
          value={isFrozen ? "--:--" : inTime}
          onChange={(e) => setInTime(e.target.value)}
          title="Jam Masuk dibekukan (otomatis sesuai Schedule Shift)"
          className="bg-slate-950/60 border border-white/5 rounded-lg p-1.5 px-3 text-[10px] font-bold text-slate-400 outline-none w-24 mx-auto block cursor-not-allowed opacity-75"
        />
      </td>
      <td className="p-4 text-center">
        <input
          type="time"
          disabled={isFrozen}
          value={isFrozen ? "--:--" : outTime}
          onChange={(e) => setOutTime(e.target.value)}
          className={`bg-slate-950 border border-white/5 rounded-lg p-1.5 px-3 text-[10px] font-bold text-white outline-none focus:ring-1 ring-blue-500 w-24 mx-auto block ${isFrozen ? "opacity-30 cursor-not-allowed text-slate-500" : ""}`}
        />
      </td>
      <td className="p-4 text-center">
        <input
          type="number"
          step="0.5"
          min="0"
          value={isFrozen ? "" : (isNaN(brk) ? 0 : brk)}
          disabled={true}
          onChange={(e) => setBrk(Number(e.target.value))}
          title="Break dibekukan (angka bawaan 0 / sesuai Break Time module)"
          className="bg-slate-950/60 border border-white/5 rounded-lg p-1.5 px-3 text-[10px] font-bold text-slate-400 outline-none w-16 mx-auto block cursor-not-allowed opacity-75"
        />
      </td>
      <td className="p-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            placeholder={isFrozen ? `${staff.name} dibekukan` : "Notes..."}
            value={isFrozen ? "" : notes}
            disabled={isFrozen}
            onChange={(e) => setNotes(e.target.value)}
            className={`bg-slate-950 border border-white/5 rounded-lg p-1.5 px-3 text-[10px] font-bold text-white outline-none focus:ring-1 ring-blue-500 w-full min-w-[120px] ${isFrozen ? "opacity-30 cursor-not-allowed text-slate-500 italic" : ""}`}
          />
          {!isFrozen && (
            <div className="flex items-center gap-1.5 justify-center flex-wrap">
              {/* Training input & button */}
              <div className="flex items-center gap-1 bg-purple-950/40 border border-purple-500/30 rounded-md p-0.5">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Jam"
                  value={trainingHours}
                  onChange={(e) => setTrainingHours(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-10 bg-slate-950/80 border border-purple-500/20 rounded text-[9px] font-bold text-purple-200 text-center outline-none focus:border-purple-400 py-0.5"
                  title="Input angka jam Training"
                />
                <button
                  type="button"
                  onClick={() => {
                    setNotes((prev) => {
                      if (prev.toLowerCase().includes("training")) {
                        return removeTag(prev, "Training");
                      }
                      const tag = trainingHours !== "" && Number(trainingHours) > 0 ? `Training ${trainingHours} Jam` : "Training";
                      return prev ? `${prev} - ${tag}` : tag;
                    });
                  }}
                  className={`px-2 py-0.5 text-[8.5px] font-black rounded transition-all flex items-center gap-1 ${
                    notes.toLowerCase().includes("training")
                      ? "bg-purple-500/40 text-purple-200 shadow-sm"
                      : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-300"
                  }`}
                  title="Tambah / Toggle Keterangan Training"
                >
                  <i className="fas fa-graduation-cap text-[8px]"></i> + Training
                </button>
              </div>

              {/* GC input & button */}
              <div className="flex items-center gap-1 bg-amber-950/40 border border-amber-500/30 rounded-md p-0.5">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Jam"
                  value={gcHours}
                  onChange={(e) => setGcHours(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-10 bg-slate-950/80 border border-amber-500/20 rounded text-[9px] font-bold text-amber-200 text-center outline-none focus:border-amber-400 py-0.5"
                  title="Input angka jam GC"
                />
                <button
                  type="button"
                  onClick={() => {
                    setNotes((prev) => {
                      if (prev.toLowerCase().includes("gc")) {
                        return removeTag(prev, "GC");
                      }
                      const tag = gcHours !== "" && Number(gcHours) > 0 ? `GC ${gcHours} Jam` : "GC";
                      return prev ? `${prev} - ${tag}` : tag;
                    });
                  }}
                  className={`px-2 py-0.5 text-[8.5px] font-black rounded transition-all flex items-center gap-1 ${
                    notes.toLowerCase().includes("gc")
                      ? "bg-amber-500/40 text-amber-200 shadow-sm"
                      : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300"
                  }`}
                  title="Tambah / Toggle Keterangan GC"
                >
                  <i className="fas fa-broom text-[8px]"></i> + GC
                </button>
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="p-4 text-center">
        <button
          onClick={handleSave}
          disabled={isFrozen}
          className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
            isFrozen
              ? "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
              : isSaved
                ? "bg-emerald-500 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {isFrozen ? (
            <span className="flex items-center gap-1 justify-center">
              <i className="fas fa-lock"></i> Locked
            </span>
          ) : isSaved ? (
            <i className="fas fa-check"></i>
          ) : (
            "Simpan"
          )}
        </button>
        {!isFrozen && (
          <div className="text-[8.5px] font-mono font-black text-blue-400 mt-1 flex items-center justify-center gap-1" title="Real-time preview Overtime Hours & Pay">
            <span>OT: {previewOT.overtimeHours.toFixed(1)}h</span>
            <span className="text-emerald-400 font-normal">(Rp {previewOT.overtimePay.toLocaleString('id-ID')})</span>
          </div>
        )}
      </td>
    </tr>
  );
};

interface Props {
  data: AppState;
  onUpdate: (data: Partial<AppState>) => void;
  selectedDate: string;
  selectedOutlet?: string;
  filterMonth?: string | number;
  filterYear?: number;
}

const OvertimeModule: React.FC<Props> = ({
  data,
  onUpdate,
  selectedDate,
  selectedOutlet,
  filterMonth,
  filterYear,
}) => {
  const [activeSubView, setActiveSubView] = useState<
    "INPUT" | "SUMMARY" | "WEEKLY_OVERTIME" | "MONTHLY_PREVIEW" | "HISTORY"
  >("INPUT");
  const [showSuccess, setShowSuccess] = useState(false);
  const [localDate, setLocalDate] = useState(selectedDate);
  const [batchTrainingHours, setBatchTrainingHours] = useState<number | "">(1);
  const [batchGcHours, setBatchGcHours] = useState<number | "">(1);
  const [showConfirm, setShowConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const matrixScrollRef = useRef<HTMLDivElement>(null);

  // Sync with selectedDate prop when parent changes it
  React.useEffect(() => {
    setLocalDate(selectedDate);
  }, [selectedDate]);

  const shiftMonth = (direction: "PREV" | "NEXT") => {
    if (!localDate) return;
    const [y, m, d] = localDate.split("-").map(Number);
    const date = new Date(y, m - 1, 1); // Start at 1st
    if (direction === "PREV") {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }

    // Restore the day but cap it at the month's max days
    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    date.setDate(Math.min(d, lastDay));

    setLocalDate(toLocalDateStr(date));
  };

  const shiftDay = (direction: "PREV" | "NEXT") => {
    if (!localDate) return;
    const d = new Date(localDate);
    if (isNaN(d.getTime())) return;
    if (direction === "PREV") {
      d.setDate(d.getDate() - 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setLocalDate(toLocalDateStr(d));
  };

  const scrollMatrix = (direction: "LEFT" | "RIGHT") => {
    if (matrixScrollRef.current) {
      const scrollAmount = 200;
      matrixScrollRef.current.scrollBy({
        left: direction === "LEFT" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handleBatchApplyNote = (tag: "Training" | "GC", hours?: number | "") => {
    const period = getCutoffYearAndMonth(localDate);
    const activeStaffList = data.staffList.filter((s) => {
      if (!isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx)) return false;
      const schedCell = getStaffScheduleForDate(data.monthlySchedule, selectedOutlet || s.outlet || '', s.staffId, localDate, s.name);
      const shiftTiming = getShiftTiming(schedCell?.shift);
      const att = (data.dailyAttendance?.[localDate] || []).find(a => a.staffId === s.staffId);
      const attStatus = att ? att.status : null;
      const isOnLeave = (data.leaveRecords || []).some((lr) => {
        if (lr.staffId !== s.staffId) return false;
        if (!lr.startDate || !lr.endDate) return lr.date === localDate;
        return localDate >= lr.startDate && localDate <= lr.endDate;
      });
      const isLeave = isOnLeave || attStatus === "CUTI" || attStatus === "OFF" || attStatus === "IZIN" || attStatus === "ALFA" || attStatus === "SAKIT_DOC" || attStatus === "SAKIT_NO_DOC";
      if (shiftTiming && !shiftTiming.isWork) return false;
      if (isLeave) return false;
      return true;
    });

    if (activeStaffList.length === 0) return;

    const formattedTag = hours !== "" && hours !== undefined && Number(hours) > 0 ? `${tag} ${hours} Jam` : tag;

    const updatedDailyOT = { ...(data.dailyOvertime || {}) };
    const dayEntries = [...(updatedDailyOT[localDate] || [])];

    activeStaffList.forEach((staff) => {
      const existingIdx = dayEntries.findIndex((e) => e.staffId === staff.staffId);
      if (existingIdx >= 0) {
        const existing = dayEntries[existingIdx];
        const newNotes = existing.notes
          ? existing.notes.includes(tag)
            ? existing.notes
            : `${existing.notes} - ${formattedTag}`
          : formattedTag;
        dayEntries[existingIdx] = {
          ...existing,
          notes: newNotes,
        };
      } else {
        const schedCell = getStaffScheduleForDate(data.monthlySchedule, selectedOutlet || staff.outlet || '', staff.staffId, localDate, staff.name);
        const shiftTiming = getShiftTiming(schedCell?.shift);
        const inTime = shiftTiming?.isWork ? shiftTiming.inTime : "08:00";
        const outTime = shiftTiming?.isWork ? shiftTiming.outTime : "17:00";
        const breakEntry = (data.dailyBreakTime?.[localDate] || []).find((b) => b.staffId === staff.staffId);
        const brk = breakEntry?.totalBreakHours !== undefined ? breakEntry.totalBreakHours : 0;
        const { totalHours, overtimeHours, overtimePay } = calculateOT(inTime, outTime, brk);

        dayEntries.push({
          id: `${Date.now()}_${staff.staffId}`,
          staffId: staff.staffId,
          outlet: (selectedOutlet || staff.outlet) as any,
          date: localDate,
          clockIn: inTime,
          clockOut: outTime,
          breakTime: brk,
          totalHours,
          overtimeHours,
          overtimePay,
          notes: formattedTag,
        });
      }
    });

    updatedDailyOT[localDate] = dayEntries;
    onUpdate({ dailyOvertime: updatedDailyOT });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const currentDayOT = useMemo(() => {
    return (data.dailyOvertime?.[localDate] || []).filter(
      (e) => !selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet,
    );
  }, [data.dailyOvertime, localDate, selectedOutlet]);

  const previousDateStr = useMemo(() => {
    if (!localDate) return "";
    const parts = localDate.split("-").map(Number);
    if (parts.length !== 3) return "";
    const [y, m, d] = parts;
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() - 1);
    
    const py = dateObj.getFullYear();
    const pm = (dateObj.getMonth() + 1).toString().padStart(2, "0");
    const pd = dateObj.getDate().toString().padStart(2, "0");
    return `${py}-${pm}-${pd}`;
  }, [localDate]);

  const isPreviousDateFilled = useMemo(() => {
    if (!previousDateStr) return false;
    const entries = data.dailyOvertime?.[previousDateStr] || [];
    const filtered = entries.filter((e) => !selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet);
    return filtered.length > 0;
  }, [data.dailyOvertime, previousDateStr, selectedOutlet]);

  const isCurrentlyFilled = useMemo(() => {
    return currentDayOT.length > 0;
  }, [currentDayOT]);

  const activeNonFrozenStaffCount = useMemo(() => {
    return data.staffList.filter((s) => {
      const period = getCutoffYearAndMonth(localDate);
      if (!isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx)) return false;
      const att = (data.dailyAttendance?.[localDate] || []).find((a) => a.staffId === s.staffId);
      const status = att ? att.status : null;
      const isOnLeave = (data.leaveRecords || []).some((lr) => {
        if (lr.staffId !== s.staffId) return false;
        if (!lr.startDate || !lr.endDate) return lr.date === localDate;
        return localDate >= lr.startDate && localDate <= lr.endDate;
      });
      const finalStatus = status || (isOnLeave ? "CUTI" : null);
      const isFrozenStatus = 
        finalStatus === "OFF" || 
        finalStatus === "CUTI" || 
        finalStatus === "IZIN" || 
        finalStatus === "ALFA" ||
        finalStatus === "SAKIT_DOC" ||
        finalStatus === "SAKIT_NO_DOC";
      return !isFrozenStatus;
    }).length;
  }, [data.staffList, data.dailyAttendance, data.leaveRecords, localDate, selectedOutlet]);

  const isDayCompleted = useMemo(() => {
    return activeNonFrozenStaffCount > 0 && currentDayOT.length >= activeNonFrozenStaffCount;
  }, [activeNonFrozenStaffCount, currentDayOT]);

  const getPayrollRange = (dateStr: string) => {
    if (filterMonth !== undefined && filterMonth !== null && filterYear !== undefined && filterYear !== null) {
      const targetMonth = parseInt(filterMonth.toString(), 10);
      const targetYear = parseInt(filterYear.toString(), 10);
      const prevMonthIdx = targetMonth === 0 ? 11 : targetMonth - 1;
      const startYear = targetMonth === 0 ? targetYear - 1 : targetYear;
      const start = new Date(startYear, prevMonthIdx, 26, 0, 0, 0, 0);
      const end = new Date(targetYear, targetMonth, 25, 23, 59, 59, 999);
      return { start, end };
    }
    if (!dateStr) return { start: new Date(), end: new Date() };
    const [y, m, d] = dateStr.split("-").map(Number);
    let targetYear = y;
    let targetMonth = m - 1; // 0-indexed

    if (d >= 26) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    const start = new Date(targetYear, targetMonth - 1, 26);
    const end = new Date(targetYear, targetMonth, 25, 23, 59, 59);
    return { start, end };
  };

  const isWithinPayPeriod = (dateStr: string) => {
    if (!dateStr || !localDate) return false;
    const { start, end } = getPayrollRange(localDate);
    // Normalize dateStr to local midnight to match start/end construction
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return false;
    const [y, m, d] = parts;
    const targetDate = new Date(y, m - 1, d);
    return (
      targetDate.getTime() >= start.getTime() &&
      targetDate.getTime() <= end.getTime()
    );
  };

  const calculateOT = (inTime: string, outTime: string, brk: number, notesStr?: string) => {
    if (!inTime || !outTime)
      return { totalHours: 0, overtimeHours: 0, overtimePay: 0 };
    const [inH, inM] = inTime.split(":").map(Number);
    const [outH, outM] = outTime.split(":").map(Number);

    let totalMinutes = outH * 60 + outM - (inH * 60 + inM);
    if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts if needed

    const totalHours = totalMinutes / 60;

    // New Rule: Work Hours = Total Hours - Break Time
    // Overtime starts after 8 hours of work.
    // If Total = 9h and Break = 0h, Work = 9h, OT = 1h.
    // If Total = 9h and Break = 1h, Work = 8h, OT = 0h.
    const workHours = totalHours - brk;
    let baseOvertimeHours = Math.max(0, workHours - 8);

    const extraHours = getExtraHoursFromNotes(notesStr);
    const overtimeHours = baseOvertimeHours + extraHours;

    const overtimePay = overtimeHours * OT_RATE;

    return { totalHours, overtimeHours, overtimePay };
  };

  const handleDelete = (id: string) => {
    setShowConfirm({
      title: "HAPUS DATA LEMBUR",
      message: "Apakah Anda yakin ingin menghapus data lembur ini?",
      onConfirm: () => {
        const updatedDailyOT = { ...data.dailyOvertime };
        updatedDailyOT[localDate] = updatedDailyOT[localDate].filter(
          (e) => e.id !== id,
        );
        onUpdate({ dailyOvertime: updatedDailyOT }, undefined, true);
        setShowConfirm(null);
      },
    });
  };

  const handleDeleteHistory = (date: string) => {
    setShowConfirm({
      title: "HAPUS RIWAYAT LEMBUR",
      message: `Apakah Anda yakin ingin menghapus data lembur untuk tanggal ${date}${selectedOutlet ? ` di outlet ${selectedOutlet}` : ""}?`,
      onConfirm: () => {
        const updatedDailyOT = { ...data.dailyOvertime };
        if (selectedOutlet) {
          if (updatedDailyOT[date]) {
            updatedDailyOT[date] = updatedDailyOT[date].filter(
              (e) => e.outlet !== selectedOutlet,
            );
            if (updatedDailyOT[date].length === 0) {
              delete updatedDailyOT[date];
            }
          }
        } else {
          delete updatedDailyOT[date];
        }
        onUpdate({ dailyOvertime: updatedDailyOT }, undefined, true);
        setShowConfirm(null);
      },
    });
  };

  const getHistoryData = () => {
    const history: { date: string; entries: number; totalPay: number }[] = [];
    Object.entries(data.dailyOvertime || {}).forEach(([date, entries]) => {
      const outletEntries = (entries as any[]).filter(
        (e) => !selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet,
      );
      if (outletEntries.length > 0) {
        const totalPay = outletEntries.reduce(
          (sum, e) => sum + e.overtimePay,
          0,
        );
        history.push({ date, entries: outletEntries.length, totalPay });
      }
    });
    return history.sort((a, b) => b.date.localeCompare(a.date));
  };

  const generateDailyPDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text(`DAILY OVERTIME REPORT - ${selectedOutlet}`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Date: ${localDate}`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString('id-ID')}`, 14, 36);

    const tableData: any[] = [];
    let grandTotalPay = 0;

    currentDayOT.forEach((entry) => {
      const staff = data.staffList.find((s) => s.staffId === entry.staffId);
      tableData.push([
        staff?.name || "Unknown",
        staff?.role || "-",
        `${entry.clockIn} - ${entry.clockOut}`,
        `${entry.breakTime}h`,
        `${(entry.totalHours || 0).toFixed(1)}h`,
        `${(entry.overtimeHours || 0).toFixed(1)}h`,
        `Rp ${entry.overtimePay.toLocaleString('id-ID')}`,
      ]);
      grandTotalPay += entry.overtimePay;
    });

    autoTable(doc, {
      startY: 45,
      head: [
        ["Staff Name", "Role", "Shift", "Break", "Total", "OT Hours", "OT Pay"],
      ],
      body: tableData,
      foot: [
        [
          "",
          "",
          "",
          "",
          "",
          "GRAND TOTAL",
          `Rp ${grandTotalPay.toLocaleString('id-ID')}`,
        ],
      ],
      theme: "grid",
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: 0,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: { fontSize: 9 },
    });

    return doc;
  };

  const handleSharePDF = () => {
    const doc = generateDailyPDF();
    doc.save(`Daily_Overtime_${selectedOutlet}_${localDate}.pdf`);
  };

  const handleShareWhatsApp = async () => {
    const doc = generateDailyPDF();
    const filename = `Daily_Overtime_${selectedOutlet}_${localDate}.pdf`;
    const blob = doc.output("blob");
    const file = new File([blob], filename, { type: "application/pdf" });

    const shared = await safeNavigator.share({
      files: [file],
      title: "Daily Overtime Report",
      text: `Laporan Overtime Harian - ${selectedOutlet} - ${localDate}`,
    });

    if (!shared) {
      doc.save(filename);
      safeWindow.open(
        `https://wa.me/?text=${encodeURIComponent(`Laporan Overtime Harian - ${selectedOutlet} - ${localDate}`)}`,
        "_blank",
      );
    }
  };

  const sidebarItems = [
    {
      id: "INPUT",
      label: "Overtime Input",
      icon: "fa-plus-circle",
      desc: "Catat lembur harian",
    },
    {
      id: "WEEKLY_OVERTIME",
      label: "Weekly Summary",
      icon: "fa-chart-bar",
      desc: "Detail lembur mingguan",
    },
    {
      id: "SUMMARY",
      label: "MTD Summary",
      icon: "fa-chart-pie",
      desc: "Ringkasan divisi MTD",
    },
    {
      id: "MONTHLY_PREVIEW",
      label: "Monthly Details",
      icon: "fa-calendar-alt",
      desc: "Matrix 26 - 25",
    },
    {
      id: "HISTORY",
      label: "Database Log",
      icon: "fa-database",
      desc: "Arsip riwayat lembur",
    },
  ];

  const goPrevTab = () => {
    const idx = sidebarItems.findIndex((i) => i.id === activeSubView);
    const prevIdx = (idx - 1 + sidebarItems.length) % sidebarItems.length;
    setActiveSubView(sidebarItems[prevIdx].id as any);
  };

  const goNextTab = () => {
    const idx = sidebarItems.findIndex((i) => i.id === activeSubView);
    const nextIdx = (idx + 1) % sidebarItems.length;
    setActiveSubView(sidebarItems[nextIdx].id as any);
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in no-blur pb-20">
      {/* Horizontal Header & Controls */}
      <div className="glass-card overflow-hidden bg-slate-900 border-white/5 no-print">
        <div className="p-6 md:p-8 border-l-4 border-blue-500 flex flex-col xl:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[2rem] bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-2xl shrink-0">
              <i
                className={`fas ${
                  activeSubView === "INPUT"
                    ? "fa-pen-nib"
                    : activeSubView === "SUMMARY"
                      ? "fa-layer-group"
                      : activeSubView === "WEEKLY_OVERTIME"
                        ? "fa-chart-bar"
                        : activeSubView === "MONTHLY_PREVIEW"
                          ? "fa-calendar-check"
                          : "fa-history"
                } text-2xl text-blue-500`}
              ></i>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">
                {activeSubView === "INPUT"
                  ? "Recording Lembur"
                  : activeSubView === "SUMMARY"
                    ? "Summary Divisi"
                    : activeSubView === "WEEKLY_OVERTIME"
                      ? "Summary Mingguan"
                      : activeSubView === "MONTHLY_PREVIEW"
                        ? "Matrix Details"
                        : "Database Arsip"}
              </h2>
              <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-2 italic">
                {selectedOutlet} •{" "}
                {activeSubView === "INPUT"
                  ? `Input harian untuk ${localDate}`
                  : `Arsip data operasional`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 justify-center md:justify-end">
            {/* Date Selector Row */}
            <div className="flex items-center gap-3 bg-slate-950/50 p-2 rounded-2xl border border-white/5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => shiftDay("PREV")}
                  className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center"
                >
                  <i className="fas fa-chevron-left text-xs"></i>
                </button>
                <button
                  onClick={() => shiftDay("NEXT")}
                  className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center"
                >
                  <i className="fas fa-chevron-right text-xs"></i>
                </button>
              </div>
              <div className="h-8 w-px bg-white/10 mx-1"></div>
              <input
                type="date"
                className="bg-slate-900 border-none rounded-xl p-2 px-4 text-xs font-black text-white focus:ring-0 outline-none w-36"
                value={localDate}
                onChange={(e) => setLocalDate(e.target.value)}
              />
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2 bg-slate-950/50 p-2 rounded-2xl border border-white/5">
              <button
                onClick={handleShareWhatsApp}
                className="w-10 h-10 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl transition-all border border-white/5 flex items-center justify-center shadow-lg"
                title="Share WA by PDF"
              >
                <i className="fas fa-file-pdf"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal Tabs Area */}
        <div className="bg-slate-950/40 p-2 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={goPrevTab}
            className="w-10 h-12 rounded-xl bg-slate-950 border border-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center shrink-0"
          >
            <i className="fas fa-chevron-left text-[10px]"></i>
          </button>

          <div className="flex gap-2 min-w-max">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSubView(item.id as any)}
                className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-3 border ${
                  activeSubView === item.id
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40"
                    : "bg-slate-900/40 border-white/5 text-slate-500 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <i className={`fas ${item.icon} text-xs`}></i>
                <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={goNextTab}
            className="w-10 h-12 rounded-xl bg-slate-950 border border-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center shrink-0 ml-auto"
          >
            <i className="fas fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full space-y-8">
        <AnimatePresence mode="wait">
          {activeSubView === "INPUT" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                <div className="xl:col-span-9 space-y-6">
                  {isDayCompleted && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center animate-bounce text-emerald-400 border border-emerald-500/30">
                          <i className="fas fa-check-double text-xs"></i>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">Lembur Hari Ini Selesai Diinput!</h4>
                          <p className="text-[9.5px] font-bold text-slate-400 mt-0.5">Semua staff aktif berstatus hadir telah disubmit atau dibekukan.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          shiftDay("NEXT");
                          setShowSuccess(true);
                          setTimeout(() => setShowSuccess(false), 1500);
                        }}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-[8.5px] font-black uppercase text-white rounded-xl shadow-lg shadow-emerald-950/40 tracking-wider flex items-center gap-2 self-stretch md:self-auto justify-center"
                      >
                        Lanjut ke Tanggal Selanjutnya <i className="fas fa-arrow-right animate-pulse"></i>
                      </button>
                    </motion.div>
                  )}

                  <div className="glass-card bg-slate-900 border-t-2 border-blue-500 shadow-2xl overflow-hidden">
                    <div className="p-8 bg-slate-950/60 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                      <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                          <i className="fas fa-users text-blue-500"></i> Bulk
                          Overtime Entry
                        </h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                          Recording for {localDate}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {!isCurrentlyFilled ? (
                          <span className="px-3 py-1.5 bg-amber-500/10 text-amber-500 text-[8px] font-black rounded-lg border border-amber-500/20 uppercase flex items-center gap-1.5 shrink-0">
                            <i className="fas fa-snowflake text-amber-500"></i> BELUM TERISI (KONDISI AWAL)
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black rounded-lg border border-emerald-500/20 uppercase flex items-center gap-1.5 shrink-0 animate-pulse">
                            <i className="fas fa-check-circle text-emerald-400"></i> TERISI ({currentDayOT.length} SUBMITTED)
                          </span>
                        )}

                        {isPreviousDateFilled && (
                          <span className="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 text-[8px] font-black rounded-lg border border-cyan-500/20 uppercase flex items-center gap-1.5 shrink-0 font-black">
                            <i className="fas fa-sync text-cyan-400"></i> AUTO REFRESH ACTIVE (PREV DATE IN)
                          </span>
                        )}

                        <span className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded-full border border-blue-500/20 uppercase shrink-0">
                          {
                            data.staffList.filter((s) => {
                              const period = getCutoffYearAndMonth(localDate);
                              return isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx);
                            }).length
                          }{" "}
                          Staff Active
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left table-fixed min-w-[900px]">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-600 uppercase tracking-widest bg-slate-950/40">
                            <th className="p-4 px-8 w-[250px]">Staff Member</th>
                            <th className="p-4 text-center w-[120px]">
                              Clock In
                            </th>
                            <th className="p-4 text-center w-[120px]">
                              Clock Out
                            </th>
                            <th className="p-4 text-center w-[100px]">
                              Break (h)
                            </th>
                            <th className="p-4 text-center w-[200px]">Notes</th>
                            <th className="p-4 text-center w-[120px]">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(() => {
                            const grouped = data.staffList
                              .filter((s) => {
                                const period = getCutoffYearAndMonth(localDate);
                                return isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx);
                              })
                              .reduce(
                                (acc, staff) => {
                                  const div = staff.division || "OTHER";
                                  if (!acc[div]) acc[div] = [];
                                  acc[div].push(staff);
                                  return acc;
                                },
                                {} as Record<string, Staff[]>,
                              );

                            return (['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER', 'PUBLIC ATTENDANCE', 'STEWARD', 'OTHER'] as string[])
                              .filter(div => grouped[div] && grouped[div].length > 0)
                              .map((division) => (
                                <React.Fragment key={division}>
                                  <tr className="bg-slate-950/60">
                                    <td
                                      colSpan={6}
                                      className="p-2 px-8 border-b border-white/5"
                                    >
                                      <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.2em]">
                                        {division}
                                      </span>
                                    </td>
                                  </tr>
                                  {sortStaff(grouped[division]).map((staff) => (
                                    <StaffInputRow
                                      key={staff.id}
                                      staff={staff}
                                      date={localDate}
                                      outlet={selectedOutlet}
                                      calculateOT={calculateOT}
                                      onUpdate={onUpdate}
                                      data={data}
                                    />
                                  ))}
                                </React.Fragment>
                              ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden shadow-2xl bg-slate-900/40 border-white/5">
                    <div className="p-6 bg-slate-950/60 border-b border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <i className="fas fa-list text-[10px] text-blue-500"></i>
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
                          Today Activity Log
                        </h3>
                      </div>
                      <span className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded-full border border-blue-500/20 uppercase">
                        {currentDayOT.length} Submissions
                      </span>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-600 uppercase tracking-widest bg-slate-950/40">
                            <th className="p-6 border-b border-white/5">
                              Staff Details
                            </th>
                            <th className="p-6 border-b border-white/5 text-center">
                              Work Shift
                            </th>
                            <th className="p-6 border-b border-white/5 text-center">
                              OT Hours
                            </th>
                            <th className="p-6 border-b border-white/5 text-right">
                              Estimate Pay
                            </th>
                            <th className="p-6 border-b border-white/5 text-center">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {currentDayOT.length > 0 ? (
                            currentDayOT.map((entry) => {
                              const staff = data.staffList.find(
                                (s) => s.staffId === entry.staffId,
                              );
                              return (
                                <tr
                                  key={entry.id}
                                  className="hover:bg-white/5 transition-all group"
                                >
                                  <td className="p-6">
                                    <div className="text-[11px] font-black text-white uppercase tracking-tight flex items-center gap-2 flex-wrap">
                                      <span>{staff?.name || "Unknown"}</span>
                                      {entry.notes && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {entry.notes.split("-").map((n) => n.trim()).filter(Boolean).map((part, idx) => {
                                            const isTraining = part.toLowerCase().includes("training");
                                            const isGC = part.toLowerCase().includes("gc");
                                            if (isTraining) {
                                              return (
                                                <span key={idx} className="text-[7.5px] px-1.5 py-0.5 rounded font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                                  <i className="fas fa-graduation-cap text-purple-400"></i> {part}
                                                </span>
                                              );
                                            }
                                            if (isGC) {
                                              return (
                                                <span key={idx} className="text-[7.5px] px-1.5 py-0.5 rounded font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                                  <i className="fas fa-broom text-amber-400"></i> {part}
                                                </span>
                                              );
                                            }
                                            return (
                                              <span key={idx} className="text-[7.5px] px-1.5 py-0.5 rounded font-normal italic text-slate-400">
                                                ({part})
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-[8px] text-indigo-500 font-black uppercase mt-1 tracking-widest flex items-center gap-2 flex-wrap">
                                      <span>{staff?.role}</span>
                                    </div>
                                  </td>
                                  <td className="p-6 text-center">
                                    <div className="text-[10px] font-black text-slate-400">
                                      {entry.clockIn} - {entry.clockOut}
                                    </div>
                                    <div className="text-[8px] text-slate-600 font-bold uppercase mt-1">
                                      Break {entry.breakTime}h
                                    </div>
                                  </td>
                                  {(() => {
                                    const baseOT = Math.max(0, (entry.totalHours || 0) - (entry.breakTime || 0) - 8);
                                    const extraOT = getExtraHoursFromNotes(entry.notes);
                                    const displayOT = Math.max(entry.overtimeHours || 0, baseOT + extraOT);
                                    const displayPay = displayOT * OT_RATE;
                                    return (
                                      <>
                                        <td className="p-6 text-center">
                                          <div
                                            className={`text-sm font-black ${displayOT > 0 ? "text-blue-400" : "text-slate-800"}`}
                                          >
                                            {displayOT.toFixed(1)}h
                                          </div>
                                        </td>
                                        <td className="p-6 text-right">
                                          <div className="text-[11px] font-black text-emerald-400">
                                            Rp {displayPay.toLocaleString('id-ID')}
                                          </div>
                                        </td>
                                      </>
                                    );
                                  })()}
                                  <td className="p-6 text-center">
                                    <button
                                      onClick={() => handleDelete(entry.id)}
                                      className="w-10 h-10 rounded-2xl bg-red-500/5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                                    >
                                      <i className="fas fa-trash-alt text-[10px]"></i>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-6 opacity-10">
                                  <i className="fas fa-clock text-8xl"></i>
                                  <span className="text-xs font-black uppercase tracking-[0.5em]">
                                    No Submissions Today
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-3">
                  {/* Right Sidebar Widget for MTD Summary */}
                  <div className="glass-card p-6 bg-slate-900 shadow-xl border-l-2 border-emerald-500 sticky top-8">
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
                      MTD Summary Preview
                      <i className="fas fa-chart-line text-emerald-500"></i>
                    </h4>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                        <div className="text-[8px] font-black text-slate-600 uppercase mb-1">
                          Total OT Pay MTD
                        </div>
                        <div className="text-xl font-mono font-black text-emerald-400">
                          Rp{" "}
                          {(
                            Object.values(
                              data.dailyOvertime || {},
                            ).flat() as OvertimeEntry[]
                          )
                            .filter(
                              (e) =>
                                isWithinPayPeriod(e.date) &&
                                (!selectedOutlet ||
                                  selectedOutlet === 'ALL' ||
                                  e.outlet === selectedOutlet),
                            )
                            .reduce((acc, curr) => acc + curr.overtimePay, 0)
                            .toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                        <div className="text-[8px] font-black text-slate-600 uppercase mb-1">
                          Total OT Hours MTD
                        </div>
                        <div className="text-xl font-mono font-black text-blue-400">
                          {(
                            Object.values(
                              data.dailyOvertime || {},
                            ).flat() as OvertimeEntry[]
                          )
                            .filter(
                              (e) =>
                                isWithinPayPeriod(e.date) &&
                                (!selectedOutlet ||
                                  selectedOutlet === 'ALL' ||
                                  e.outlet === selectedOutlet),
                            )
                            .reduce((acc, curr) => acc + curr.overtimeHours, 0)
                            .toFixed(1)}
                          h
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveSubView("SUMMARY")}
                      className="w-full mt-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
                    >
                      View Full Summary
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubView === "SUMMARY" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass-card overflow-hidden shadow-2xl bg-slate-900 border-t-2 border-indigo-500">
                <div className="p-8 bg-slate-950/50 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      MTD Summary Report
                    </h3>
                    <p className="text-xs font-black text-white uppercase tracking-tighter">
                      Periode Berjalan:{" "}
                      {new Date(localDate).toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-slate-900 p-4 rounded-2xl border border-white/10 text-center min-w-[140px]">
                      <div className="text-[8px] font-black text-slate-500 uppercase mb-1">
                        Total OT Pay MTD
                      </div>
                      <div className="text-sm font-black text-emerald-400">
                        Rp{" "}
                        {(
                          Object.values(
                            data.dailyOvertime || {},
                          ).flat() as OvertimeEntry[]
                        )
                          .filter(
                            (e) =>
                              isWithinPayPeriod(e.date) &&
                              (!selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet),
                          )
                          .reduce((acc, curr) => acc + curr.overtimePay, 0)
                          .toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {(['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER', 'PUBLIC ATTENDANCE', 'STEWARD', 'OTHER'] as string[]).map((division) => {
                    const staffMembers = sortStaff(data.staffList)
                      .filter((s) => {
                        const period = getCutoffYearAndMonth(localDate);
                        return isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx) && s.division === division;
                      });
                    
                    if (staffMembers.length === 0) return null;

                    const divTotalPay = (staffMembers as Staff[]).reduce(
                      (total, staff) => {
                        let staffPay = 0;
                        Object.entries(data.dailyOvertime || {}).forEach(
                          ([date, entries]) => {
                            if (isWithinPayPeriod(date)) {
                              (entries as OvertimeEntry[]).forEach((e) => {
                                if (
                                  e.staffId === staff.staffId &&
                                  (!selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet)
                                ) {
                                  staffPay += e.overtimePay;
                                }
                              });
                            }
                          },
                        );
                        return total + staffPay;
                      },
                      0,
                    );

                    return (
                      <div key={division} className="space-y-4">
                        <div className="flex justify-between items-end pb-3 border-b border-white/10">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em]">
                            {division} DIVISION
                          </span>
                          <span className="text-[11px] font-black text-white">
                            Rp {divTotalPay.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(staffMembers as Staff[]).map((staff) => {
                            let totalHours = 0;
                            let totalPay = 0;
                            Object.entries(data.dailyOvertime || {}).forEach(
                              ([date, entries]) => {
                                if (isWithinPayPeriod(date)) {
                                  (entries as any[]).forEach((e) => {
                                    if (
                                      e.staffId === staff.staffId &&
                                      (!selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet)
                                    ) {
                                      totalHours += e.overtimeHours;
                                      totalPay += e.overtimePay;
                                    }
                                  });
                                }
                              },
                            );

                            if (totalPay === 0) return null;

                            return (
                              <div
                                key={staff.id}
                                className="flex justify-between items-center p-3 bg-slate-950/40 rounded-xl border border-white/5 hover:bg-white/5 transition-colors"
                              >
                                <div className="flex-1">
                                  <div className="text-[11px] font-black text-white uppercase">
                                    {staff.name}
                                  </div>
                                  <div className="text-[8px] text-slate-500 font-bold uppercase">
                                    {staff.role}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[11px] font-black text-emerald-400">
                                    Rp {totalPay.toLocaleString('id-ID')}
                                  </div>
                                  <div className="text-[9px] font-bold text-slate-600 uppercase">
                                    {(totalHours || 0).toFixed(1)}h Overtime
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeSubView === "WEEKLY_OVERTIME" && (
            <motion.div
              key="weekly"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass-card overflow-hidden shadow-2xl bg-slate-900 border-t-2 border-blue-500">
                <div className="p-8 bg-slate-950/50 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Weekly Overtime Report
                    </h3>
                    <p className="text-xs font-black text-white uppercase tracking-tighter">
                      Analisa Mingguan Berdasarkan Periode 26-25
                    </p>
                  </div>
                </div>

                <div className="p-8 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(() => {
                      const { start, end } = getPayrollRange(localDate);

                      // Calculate weeks
                      const weeks: {
                        start: string;
                        end: string;
                        label: string;
                      }[] = [];
                      let wStart = new Date(start);
                      let weekNum = 1;
                      while (wStart <= end) {
                        let wEnd = new Date(wStart);
                        wEnd.setDate(wStart.getDate() + 6);
                        if (wEnd > end) wEnd = new Date(end);

                        weeks.push({
                          start: toLocalDateStr(wStart),
                          end: toLocalDateStr(wEnd),
                          label: `Week ${weekNum}`,
                        });

                        wStart.setDate(wStart.getDate() + 7);
                        weekNum++;
                      }

                      return weeks.map((week) => {
                        const weekEntries = (
                          Object.values(
                            data.dailyOvertime || {},
                          ).flat() as OvertimeEntry[]
                        ).filter(
                          (e) =>
                            e.date >= week.start &&
                            e.date <= week.end &&
                            (!selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet),
                        );

                        const totalPay = weekEntries.reduce(
                          (sum, e) => sum + e.overtimePay,
                          0,
                        );
                        const totalHours = weekEntries.reduce(
                          (sum, e) => sum + e.overtimeHours,
                          0,
                        );

                        return (
                          <div
                            key={week.label}
                            className="glass-card p-6 bg-slate-950/40 border border-white/5 space-y-4 hover:bg-slate-900 transition-all duration-300 group"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                                  {week.label}
                                </div>
                                <div className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter whitespace-nowrap">
                                  {new Intl.DateTimeFormat("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                  }).format(new Date(week.start))}{" "}
                                  -{" "}
                                  {new Intl.DateTimeFormat("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                  }).format(new Date(week.end))}
                                </div>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                <i className="fas fa-calendar-day text-[10px]"></i>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="text-[8px] font-black text-slate-600 uppercase">
                                Weekly Pay
                              </div>
                              <div className="text-lg font-mono font-black text-white">
                                Rp {totalPay.toLocaleString('id-ID')}
                              </div>
                            </div>

                            <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">
                                Activity
                              </span>
                              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                {totalHours.toFixed(1)}h
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubView === "MONTHLY_PREVIEW" && (
            <motion.div
              key="monthly_preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="glass-card bg-slate-900 border-t-2 border-emerald-500 shadow-2xl overflow-hidden">
                <div className="p-8 bg-slate-950/60 border-b border-white/5 flex flex-col lg:flex-row justify-between items-center gap-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                        <button
                          onClick={() => shiftMonth("PREV")}
                          className="w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-blue-600 transition-all flex items-center justify-center border border-white/5 active:scale-95"
                        >
                          <i className="fas fa-chevron-left"></i>
                        </button>
                        <div className="px-6 flex flex-col justify-center items-center min-w-[120px]">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                            {new Intl.DateTimeFormat("id-ID", {
                              month: "long",
                              year: "numeric",
                            }).format(new Date(localDate))}
                          </span>
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">
                            Payroll Period
                          </span>
                        </div>
                        <button
                          onClick={() => shiftMonth("NEXT")}
                          className="w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-blue-600 transition-all flex items-center justify-center border border-white/5 active:scale-95"
                        >
                          <i className="fas fa-chevron-right"></i>
                        </button>
                      </div>
                      <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                        <button
                          onClick={() => scrollMatrix("LEFT")}
                          className="w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-emerald-600 transition-all flex items-center justify-center border border-white/5 active:scale-95"
                        >
                          <i className="fas fa-arrow-left text-[10px]"></i>
                        </button>
                        <button
                          onClick={() => scrollMatrix("RIGHT")}
                          className="w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-emerald-600 transition-all flex items-center justify-center border border-white/5 active:scale-95 ml-1"
                        >
                          <i className="fas fa-arrow-right text-[10px]"></i>
                        </button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                        Staff Overtime Matrix
                      </h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">
                        26th Prev - 25th Current
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">
                      Total Period Pay
                    </div>
                    <div className="text-2xl font-black text-white">
                      Rp{" "}
                      {(
                        Object.values(
                          data.dailyOvertime || {},
                        ).flat() as OvertimeEntry[]
                      )
                        .filter(
                          (e) =>
                            isWithinPayPeriod(e.date) &&
                            (!selectedOutlet || selectedOutlet === 'ALL' || e.outlet === selectedOutlet),
                        )
                        .reduce((acc, curr) => acc + curr.overtimePay, 0)
                        .toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <div
                    ref={matrixScrollRef}
                    className="overflow-x-auto custom-scrollbar border border-white/5 rounded-3xl bg-slate-950/40"
                  >
                    <table className="w-full text-left border-collapse min-w-max">
                      <thead>
                        <tr className="bg-slate-900/80">
                          <th className="p-4 border-b border-r border-white/10 sticky left-0 bg-slate-900 z-20 min-w-[150px]">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Division / Staff
                            </span>
                          </th>
                          {(() => {
                            const { start, end } = getPayrollRange(localDate);
                            const cols = [];
                            let curr = new Date(start);
                            while (curr <= end) {
                              const dateStr = toLocalDateStr(curr);
                              cols.push(
                                <th
                                  key={dateStr}
                                  className="p-4 border-b border-r border-white/10 text-center min-w-[70px]"
                                >
                                  <div className="text-[9px] font-black text-slate-400 uppercase">
                                    {curr.getDate()}
                                  </div>
                                  <div className="text-[7px] text-slate-600 font-bold uppercase">
                                    {new Intl.DateTimeFormat("id-ID", {
                                      weekday: "short",
                                    }).format(curr)}
                                  </div>
                                </th>,
                              );
                              curr.setDate(curr.getDate() + 1);
                            }
                            cols.push(
                              <th
                                key="total-ot"
                                className="p-4 border-b border-white/10 text-center sticky right-0 bg-slate-900 z-20 min-w-[70px] shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.5)]"
                              >
                                <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">
                                  Total OT
                                </span>
                              </th>,
                            );
                            return cols;
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {(['SERVICE', 'KITCHEN', 'BAR', 'STORE KEEPER', 'PUBLIC ATTENDANCE', 'STEWARD', 'OTHER'] as string[]).map((division) => {
                          const staffMembers = sortStaff(data.staffList)
                            .filter((s) => {
                              const period = getCutoffYearAndMonth(localDate);
                              return isStaffVisibleAtOutlet(s, selectedOutlet as any, period.year, period.monthIdx) && s.division === division;
                            });
                          
                          if (staffMembers.length === 0) return null;

                          return (
                          <React.Fragment key={division}>
                            <tr className="bg-slate-950/80">
                              <td
                                colSpan={100}
                                className="p-2 px-6 border-b border-white/5"
                              >
                                <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.3em]">
                                  {division}
                                </span>
                              </td>
                            </tr>
                            {(staffMembers as Staff[]).map((staff) => (
                              <tr
                                key={staff.id}
                                className="hover:bg-white/5 transition-colors group"
                              >
                                <td className="p-4 border-b border-r border-white/5 sticky left-0 bg-slate-950/80 z-10 backdrop-blur-sm group-hover:bg-slate-900 transition-colors">
                                  <div className="text-[10px] font-black text-white uppercase">
                                    {staff.name}
                                  </div>
                                  <div className="text-[7px] text-indigo-500 font-black uppercase mt-0.5 tracking-widest">
                                    {staff.role}
                                  </div>
                                </td>
                                {(() => {
                                  const { start, end } =
                                    getPayrollRange(localDate);
                                  const cells = [];
                                  let curr = new Date(start);
                                  let totalOT = 0;
                                  while (curr <= end) {
                                    const dateStr = toLocalDateStr(curr);
                                    const otEntry = (
                                      data.dailyOvertime?.[dateStr] || []
                                    ).find(
                                      (e) =>
                                        e.staffId === staff.staffId &&
                                        (!selectedOutlet ||
                                          selectedOutlet === 'ALL' ||
                                          e.outlet === selectedOutlet),
                                    );
                                    const attEntry = (
                                      data.dailyAttendance?.[dateStr] || []
                                    ).find((a) => a.staffId === staff.staffId);

                                    if (otEntry)
                                      totalOT += otEntry.overtimeHours;

                                    let statusLabel = "";
                                    let statusColor = "";

                                    // Check manual attendance first
                                    if (attEntry) {
                                      if (attEntry.status === "SAKIT_DOC") {
                                        statusLabel = "SICK (S)";
                                        statusColor = "text-amber-400";
                                      } else if (attEntry.status === "SAKIT_NO_DOC") {
                                        statusLabel = "SICK (TS)";
                                        statusColor = "text-orange-400";
                                      } else if (attEntry.status === "CUTI") {
                                        statusLabel = "CUTI";
                                        statusColor = "text-blue-400";
                                      } else if (attEntry.status === "ALFA") {
                                        statusLabel = "ALFA";
                                        statusColor = "text-red-500";
                                      } else if (attEntry.status === "OFF") {
                                        statusLabel = "OFF";
                                        statusColor = "text-slate-600";
                                      } else if (attEntry.status === "IZIN") {
                                        statusLabel = "IZIN";
                                        statusColor = "text-indigo-400";
                                      }
                                    }

                                    // Fallback to leaveRecords for CUTI if no manual status
                                    if (!statusLabel && data.leaveRecords) {
                                      const isOnLeave = data.leaveRecords.some(
                                        (lr) => {
                                          if (lr.staffId !== staff.staffId)
                                            return false;
                                          if (!lr.startDate || !lr.endDate)
                                            return lr.date === dateStr;
                                          return (
                                            dateStr >= lr.startDate &&
                                            dateStr <= lr.endDate
                                          );
                                        },
                                      );
                                      if (isOnLeave) {
                                        statusLabel = "CUTI";
                                        statusColor = "text-blue-400";
                                      }
                                    }

                                    // Fallback to Schedule (monthlySchedule) if no status found yet
                                    if (!statusLabel) {
                                      const schedCell = getStaffScheduleForDate(
                                        data.monthlySchedule,
                                        selectedOutlet || staff.outlet || '',
                                        staff.staffId,
                                        dateStr
                                      );
                                      if (schedCell && schedCell.shift) {
                                        const timing = getShiftTiming(schedCell.shift);
                                        if (timing && !timing.isWork) {
                                          if (timing.code === "OFF" || timing.code === "EO") {
                                            statusLabel = "OFF";
                                            statusColor = "text-slate-600";
                                          } else if (timing.code === "CUTI") {
                                            statusLabel = "CUTI";
                                            statusColor = "text-blue-400";
                                          } else if (timing.code === "IZIN") {
                                            statusLabel = "IZIN";
                                            statusColor = "text-indigo-400";
                                          } else if (timing.code === "ALPHA" || timing.code === "ALFA") {
                                            statusLabel = "ALFA";
                                            statusColor = "text-red-500";
                                          } else if (timing.code === "SICK" || timing.code === "SAKIT") {
                                            statusLabel = "SICK";
                                            statusColor = "text-amber-400";
                                          } else {
                                            statusLabel = timing.code;
                                            statusColor = "text-slate-400";
                                          }
                                        }
                                      }
                                    }

                                    cells.push(
                                      <td
                                        key={dateStr}
                                        className="p-4 border-b border-r border-white/5 text-center transition-all group-hover:bg-white/5 relative min-w-[70px]"
                                      >
                                        {otEntry ? (
                                          <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-black text-blue-400">
                                              {otEntry.overtimeHours.toFixed(1)}
                                              h
                                            </span>
                                            <span className="text-[7px] font-bold text-slate-600 uppercase">
                                              OT
                                            </span>
                                            {otEntry.notes && (
                                              <div className="mt-1 flex items-center gap-1">
                                                <i className="fas fa-sticky-note text-[6px] text-indigo-400 animate-pulse"></i>
                                                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-900 border border-white/10 rounded-lg shadow-2xl z-50 pointer-events-none transition-opacity">
                                                  <p className="text-[7px] text-white font-bold leading-tight">
                                                    {otEntry.notes}
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ) : statusLabel ? (
                                          <div className="flex flex-col items-center">
                                            <span
                                              className={`text-[8px] font-black uppercase ${statusColor}`}
                                            >
                                              {statusLabel}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-[10px] text-slate-800">
                                            -
                                          </span>
                                        )}
                                      </td>,
                                    );
                                    curr.setDate(curr.getDate() + 1);
                                  }
                                  cells.push(
                                    <td
                                      key="total-ot"
                                      className="p-4 border-b border-white/5 text-center font-black sticky right-0 bg-slate-950/80 z-10 backdrop-blur-sm group-hover:bg-slate-900 transition-colors shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.5)]"
                                    >
                                      <span
                                        className={
                                          totalOT > 0
                                            ? "text-rose-400"
                                            : "text-slate-600"
                                        }
                                      >
                                        {totalOT > 0
                                          ? totalOT.toFixed(1) + "h"
                                          : "-"}
                                      </span>
                                    </td>,
                                  );
                                  return cells;
                                })()}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubView === "HISTORY" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass-card overflow-hidden shadow-2xl bg-slate-900/60 border-t-2 border-orange-500">
                <div className="p-8 bg-slate-950/60 border-b border-white/5 flex justify-between items-center whitespace-nowrap overflow-x-auto no-scrollbar">
                  <div>
                    <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                      <i className="fas fa-database"></i> Database Index Log
                    </h3>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                      Master Audit History Record
                    </p>
                  </div>
                  <div className="text-[11px] font-mono text-orange-400 bg-orange-500/5 px-6 py-3 rounded-2xl border border-orange-500/20 flex items-center gap-4">
                    <i className="fas fa-server"></i>
                    {getHistoryData().length} DAILY BLOCKS INDEXED
                  </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] bg-slate-950/80">
                        <th className="p-8 border-b border-white/5">Index #</th>
                        <th className="p-8 border-b border-white/5">
                          Date Timestamp
                        </th>
                        <th className="p-8 border-b border-white/5 text-center">
                          Load Status
                        </th>
                        <th className="p-8 border-b border-white/5 text-right">
                          Block Value
                        </th>
                        <th className="p-8 border-b border-white/5 text-center">
                          Aksi Control
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {getHistoryData().length > 0 ? (
                        getHistoryData().map((item, idx) => (
                          <tr
                            key={idx}
                            className="group hover:bg-white/5 transition-all duration-300"
                          >
                            <td className="p-8">
                              <div className="text-xl font-black text-slate-800 group-hover:text-orange-500/40 transition-colors">
                                {(idx + 1).toString().padStart(2, "0")}
                              </div>
                            </td>
                            <td className="p-8">
                              <div className="text-base font-black text-white uppercase tracking-tight">
                                {item.date}
                              </div>
                              <div className="text-[9px] font-mono text-slate-500 uppercase mt-1">
                                LOG_OT_{item.date.replace(/-/g, "")}
                              </div>
                            </td>
                            <td className="p-8 text-center">
                              <span className="px-4 py-2 rounded-xl bg-slate-950 border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                                {item.entries} STAFF RECORDED
                              </span>
                            </td>
                            <td className="p-8 text-right">
                              <div className="text-lg font-mono font-black text-emerald-400 leading-none">
                                Rp {item.totalPay.toLocaleString('id-ID')}
                              </div>
                              <div className="text-[8px] font-black text-emerald-900 uppercase mt-1">
                                Verified Audit
                              </div>
                            </td>
                            <td className="p-8 text-center">
                              <div className="flex justify-center gap-4">
                                <button
                                  onClick={() => {
                                    setLocalDate(item.date);
                                    setActiveSubView("INPUT");
                                    safeWindow.scrollTo({
                                      top: 0,
                                      behavior: "smooth",
                                    });
                                  }}
                                  className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-xl shadow-indigo-500/10 active:scale-90"
                                  title="Jump to date"
                                >
                                  <i className="fas fa-external-link-alt text-sm"></i>
                                </button>
                                <button
                                  onClick={() => handleDeleteHistory(item.date)}
                                  className="w-12 h-12 rounded-2xl bg-red-600/5 text-slate-600 hover:text-red-500 flex items-center justify-center transition-all border border-white/5 active:scale-90"
                                  title="Purge record"
                                >
                                  <i className="fas fa-trash-alt text-sm"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-40 text-center">
                            <div className="flex flex-col items-center gap-8 opacity-10">
                              <i className="fas fa-database text-9xl"></i>
                              <span className="text-lg font-black uppercase tracking-[0.5em]">
                                No record archived
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-emerald-500/30 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <i className="fas fa-check text-4xl text-emerald-400"></i>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">
                  SUBMIT BERHASIL
                </h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                  Data overtime telah berhasil disimpan ke database.
                </p>
              </div>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
              >
                MENGERTI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>

              <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                  {showConfirm.title}
                </h3>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest leading-relaxed">
                  {showConfirm.message}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowConfirm(null)}
                  className="py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-white/5"
                >
                  BATALKAN
                </button>
                <button
                  onClick={showConfirm.onConfirm}
                  className="py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-red-900/40"
                >
                  YA, HAPUS
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OvertimeModule;
