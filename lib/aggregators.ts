import { AppState } from '../types';
import { INITIAL_STATE } from '../constants';

export const buildAggregatedGlobalData = (allOutletsData: Record<string, any>, currentGlobalData: any): AppState => {
  const allStaffMap: Record<string, any> = {};
  const allLeaveRecordsMap: Record<string, any> = {};
  const dailyAttendance: Record<string, any[]> = {};
  const dailyOvertime: Record<string, any[]> = {};
  const aggregatedDailyRecording: Record<string, any> = {};
  const aggregatedExpenses: Record<string, any> = {};
  const aggregatedNonCommodity: Record<string, any[]> = {};
  const aggregatedCommodity: Record<string, any[]> = {};
  const aggregatedMaintenance: Record<string, any[]> = {};
  const aggregatedAsset: Record<string, any[]> = {};
  const aggregatedCasual: Record<string, any[]> = {};
  const aggregatedAtk: Record<string, any[]> = {};
  const aggregatedWeeklyOvertime: Record<string, any[]> = {};
  const aggregatedChemical: Record<string, any[]> = {};
  const aggregatedCashLedger: Record<string, any[]> = {};
  const aggregatedCityLedger: any[] = [];
  const aggregatedDailyCityLedger: Record<string, any[]> = {};
  const aggregatedCustomerSat: any[] = [];
  const aggregatedDailyCustomerSat: Record<string, any[]> = {};
  const aggregatedComplimentary: any[] = [];
  const aggregatedDailyComplimentary: Record<string, any[]> = {};
  const aggregatedMainStore: Record<string, any[]> = {};
  const aggregatedMainKitchen: Record<string, any[]> = {};
  const aggregatedGuestSupplies: Record<string, any[]> = {};
  const aggregatedTgif: Record<string, any[]> = {};
  const aggregatedSukanda: Record<string, any[]> = {};
  const aggregatedEverest: Record<string, any[]> = {};
  const aggregatedPanfila: Record<string, any[]> = {};
  const aggregatedIkigai: Record<string, any[]> = {};
  const aggregatedKebunku: Record<string, any[]> = {};
  const aggregatedSaungKubil: Record<string, any[]> = {};
  const aggregatedGasLedger: Record<string, any[]> = {};
  const aggregatedThirdPartyLedger: Record<string, any[]> = {};
  const aggregatedEnergyCost: Record<string, any> = {};
  const aggregatedDailyQA: Record<string, any> = {};
  const aggregatedDailyGSI: Record<string, any[]> = {};
  const aggregatedComplaints: any[] = [];
  const aggregatedLogisticItemsMap: Record<string, any> = {};
  const aggregatedDailyLogisticRecords: Record<string, Record<string, any>> = {};
  const aggregatedPeminjamanRecords: any[] = [];
  const aggregatedLogisticBeginningStocks: Record<string, Record<string, number>> = {};
  const aggregatedLogisticPeriodPrices: Record<string, Record<string, number>> = {};
  const aggregatedManpowerData: Record<string, any> = {};
  const outletSalesAdded = new Set<string>();
  const outletExpensesAdded = new Set<string>();

  const defaultPlaceholderIds = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  const isPlaceholder = (staff: any) => {
    if (!staff) return true;
    const staffIdStr = String(staff.staffId || staff.id || '');
    const baseId = staffIdStr.split('_')[0];
    if (defaultPlaceholderIds.has(baseId)) return true;
    return false;
  };

  // 1. Seed with currentGlobalData's staff if available and not placeholder
  if (currentGlobalData) {
    if (Array.isArray(currentGlobalData.staffList)) {
      currentGlobalData.staffList.forEach((staff: any) => {
        const sKey = staff.staffId || staff.id;
        if (!isPlaceholder(staff) && sKey) {
          allStaffMap[sKey] = { ...staff };
        }
      });
    }
    if (Array.isArray(currentGlobalData.leaveRecords)) {
      currentGlobalData.leaveRecords.forEach((record: any) => {
        if (record && record.id) {
          allLeaveRecordsMap[record.id] = { ...record };
        }
      });
    }
    if (currentGlobalData.manpowerData && typeof currentGlobalData.manpowerData === 'object') {
      Object.assign(aggregatedManpowerData, currentGlobalData.manpowerData);
    }
    if (currentGlobalData.dailyAttendance) {
      Object.entries(currentGlobalData.dailyAttendance).forEach(([dateStr, arr]) => {
        if (Array.isArray(arr)) {
          if (!dailyAttendance[dateStr]) dailyAttendance[dateStr] = [];
          dailyAttendance[dateStr].push(...arr);
        }
      });
    }
    if (currentGlobalData.dailyOvertime) {
      Object.entries(currentGlobalData.dailyOvertime).forEach(([dateStr, arr]) => {
        if (Array.isArray(arr)) {
          if (!dailyOvertime[dateStr]) dailyOvertime[dateStr] = [];
          dailyOvertime[dateStr].push(...arr);
        }
      });
    }
    if (Array.isArray(currentGlobalData.guestComplaints)) {
      aggregatedComplaints.push(...currentGlobalData.guestComplaints);
    }
    if (Array.isArray(currentGlobalData.logisticItems)) {
      currentGlobalData.logisticItems.forEach((item: any) => {
        if (item && item.id) aggregatedLogisticItemsMap[item.id] = { ...item };
      });
    }
    if (currentGlobalData.dailyLogisticRecords) {
      Object.entries(currentGlobalData.dailyLogisticRecords).forEach(([dateStr, recMap]: [string, any]) => {
        if (recMap && typeof recMap === 'object') {
          if (!aggregatedDailyLogisticRecords[dateStr]) aggregatedDailyLogisticRecords[dateStr] = {};
          Object.assign(aggregatedDailyLogisticRecords[dateStr], recMap);
        }
      });
    }
    if (Array.isArray(currentGlobalData.peminjamanRecords)) {
      aggregatedPeminjamanRecords.push(...currentGlobalData.peminjamanRecords);
    }
    if (currentGlobalData.logisticBeginningStocks) {
      Object.entries(currentGlobalData.logisticBeginningStocks).forEach(([pKey, pMap]: [string, any]) => {
        if (pMap && typeof pMap === 'object') {
          if (!aggregatedLogisticBeginningStocks[pKey]) aggregatedLogisticBeginningStocks[pKey] = {};
          Object.assign(aggregatedLogisticBeginningStocks[pKey], pMap);
        }
      });
    }
    if (currentGlobalData.logisticPeriodPrices) {
      Object.entries(currentGlobalData.logisticPeriodPrices).forEach(([pKey, pMap]: [string, any]) => {
        if (pMap && typeof pMap === 'object') {
          if (!aggregatedLogisticPeriodPrices[pKey]) aggregatedLogisticPeriodPrices[pKey] = {};
          Object.assign(aggregatedLogisticPeriodPrices[pKey], pMap);
        }
      });
    }
    const seedLedger = (source: any, target: Record<string, any[]>) => {
      if (!source) return;
      Object.entries(source).forEach(([dateStr, arr]) => {
        if (Array.isArray(arr)) {
          if (!target[dateStr]) target[dateStr] = [];
          target[dateStr].push(...arr);
        }
      });
    };
    seedLedger(currentGlobalData.dailyTgifLedger, aggregatedTgif);
    seedLedger(currentGlobalData.dailySukandaLedger, aggregatedSukanda);
    seedLedger(currentGlobalData.dailyEverestLedger, aggregatedEverest);
    seedLedger(currentGlobalData.dailyPanfilaLedger, aggregatedPanfila);
    seedLedger(currentGlobalData.dailyIkigaiLedger, aggregatedIkigai);
    seedLedger(currentGlobalData.dailyKebunkuLedger, aggregatedKebunku);
    seedLedger(currentGlobalData.dailySaungKubilLedger, aggregatedSaungKubil);
    seedLedger(currentGlobalData.dailyGasLedger, aggregatedGasLedger);
    seedLedger(currentGlobalData.dailyThirdPartyLedger, aggregatedThirdPartyLedger);
    if (currentGlobalData.energyCost && typeof currentGlobalData.energyCost === 'object') {
      Object.assign(aggregatedEnergyCost, currentGlobalData.energyCost);
    }
  }

  // 2. Iterate over each outlet in allOutletsData
  if (allOutletsData && typeof allOutletsData === 'object') {
    Object.entries(allOutletsData).forEach(([outletName, outletData]) => {
      if (!outletData || typeof outletData !== 'object') return;

      if (outletData.manpowerData && typeof outletData.manpowerData === 'object') {
        Object.assign(aggregatedManpowerData, outletData.manpowerData);
      }

      // Root level staff
      if (Array.isArray(outletData.staffList)) {
        outletData.staffList.forEach((staff: any) => {
          const sKey = staff.staffId || staff.id;
          if (!isPlaceholder(staff) && sKey) {
            allStaffMap[sKey] = {
              ...staff,
              outlet: staff.outlet || outletName
            };
          }
        });
      }

      // Root level leave records
      if (Array.isArray(outletData.leaveRecords)) {
        outletData.leaveRecords.forEach((record: any) => {
          if (record && record.id) {
            allLeaveRecordsMap[record.id] = {
              ...record,
              outlet: record.outlet || outletName
            };
          }
        });
      }

      // Root level complaints
      if (Array.isArray(outletData.guestComplaints)) {
        outletData.guestComplaints.forEach((c: any) => {
          if (c && !aggregatedComplaints.some(ac => ac.id === c.id)) {
            aggregatedComplaints.push({ ...c, outlet: c.outlet || outletName });
          }
        });
      }

      // Root level attendance
      if (outletData.dailyAttendance) {
        Object.entries(outletData.dailyAttendance).forEach(([dateStr, arr]) => {
          if (Array.isArray(arr)) {
            if (!dailyAttendance[dateStr]) dailyAttendance[dateStr] = [];
            arr.forEach((a: any) => {
              const mapped = { ...a, outlet: a.outlet || outletName };
              if (!dailyAttendance[dateStr].some(e => e.staffId === mapped.staffId)) {
                dailyAttendance[dateStr].push(mapped);
              }
            });
          }
        });
      }

      // Root level overtime
      if (outletData.dailyOvertime) {
        Object.entries(outletData.dailyOvertime).forEach(([dateStr, arr]) => {
          if (Array.isArray(arr)) {
            if (!dailyOvertime[dateStr]) dailyOvertime[dateStr] = [];
            arr.forEach((o: any) => {
              const mapped = { ...o, outlet: o.outlet || outletName };
              if (!dailyOvertime[dateStr].some(e => (e.id && e.id === mapped.id) || e.staffId === mapped.staffId)) {
                dailyOvertime[dateStr].push(mapped);
              }
            });
          }
        });
      }

      // Root level logistics
      if (Array.isArray(outletData.logisticItems)) {
        outletData.logisticItems.forEach((item: any) => {
          if (item && item.id) aggregatedLogisticItemsMap[item.id] = { ...item };
        });
      }
      if (outletData.dailyLogisticRecords) {
        Object.entries(outletData.dailyLogisticRecords).forEach(([dateStr, recMap]: [string, any]) => {
          if (recMap && typeof recMap === 'object') {
            if (!aggregatedDailyLogisticRecords[dateStr]) aggregatedDailyLogisticRecords[dateStr] = {};
            Object.assign(aggregatedDailyLogisticRecords[dateStr], recMap);
          }
        });
      }
      if (Array.isArray(outletData.peminjamanRecords)) {
        outletData.peminjamanRecords.forEach((p: any) => {
          if (p && p.id) {
            aggregatedPeminjamanRecords.push({ ...p, outlet: p.outlet || outletName });
          }
        });
      }
      if (outletData.logisticBeginningStocks) {
        Object.entries(outletData.logisticBeginningStocks).forEach(([pKey, pMap]: [string, any]) => {
          if (pMap && typeof pMap === 'object') {
            if (!aggregatedLogisticBeginningStocks[pKey]) aggregatedLogisticBeginningStocks[pKey] = {};
            Object.assign(aggregatedLogisticBeginningStocks[pKey], pMap);
          }
        });
      }
      if (outletData.logisticPeriodPrices) {
        Object.entries(outletData.logisticPeriodPrices).forEach(([pKey, pMap]: [string, any]) => {
          if (pMap && typeof pMap === 'object') {
            if (!aggregatedLogisticPeriodPrices[pKey]) aggregatedLogisticPeriodPrices[pKey] = {};
            Object.assign(aggregatedLogisticPeriodPrices[pKey], pMap);
          }
        });
      }

      // Root level ledgers if present
      const mergeOutletRootLedger = (source: any, target: Record<string, any[]>) => {
        if (!source) return;
        Object.entries(source).forEach(([dateStr, arr]) => {
          if (Array.isArray(arr)) {
            if (!target[dateStr]) target[dateStr] = [];
            target[dateStr].push(...arr.map((it: any) => ({ ...it, outlet: it.outlet || outletName })));
          }
        });
      };
      mergeOutletRootLedger(outletData.dailyTgifLedger, aggregatedTgif);
      mergeOutletRootLedger(outletData.dailySukandaLedger, aggregatedSukanda);
      mergeOutletRootLedger(outletData.dailyEverestLedger, aggregatedEverest);
      mergeOutletRootLedger(outletData.dailyPanfilaLedger, aggregatedPanfila);
      mergeOutletRootLedger(outletData.dailyIkigaiLedger, aggregatedIkigai);
      mergeOutletRootLedger(outletData.dailyKebunkuLedger, aggregatedKebunku);
      mergeOutletRootLedger(outletData.dailySaungKubilLedger, aggregatedSaungKubil);
      mergeOutletRootLedger(outletData.dailyGasLedger, aggregatedGasLedger);
      mergeOutletRootLedger(outletData.dailyThirdPartyLedger, aggregatedThirdPartyLedger);
      if (outletData.energyCost && typeof outletData.energyCost === 'object') {
        Object.assign(aggregatedEnergyCost, outletData.energyCost);
      }

      // Iterate through months 0-11
      for (let m = 0; m < 12; m++) {
        const mData = outletData[m.toString()] || outletData[m] || outletData.monthlyData?.[m.toString()] || outletData.monthlyData?.[m];
        if (!mData || typeof mData !== 'object') continue;

        if (mData.manpowerData && typeof mData.manpowerData === 'object') {
          Object.assign(aggregatedManpowerData, mData.manpowerData);
        }

        // Month level staff
        if (Array.isArray(mData.staffList)) {
          mData.staffList.forEach((staff: any) => {
            const sKey = staff.staffId || staff.id;
            if (!isPlaceholder(staff) && sKey) {
              allStaffMap[sKey] = {
                ...staff,
                outlet: staff.outlet || outletName
              };
            }
          });
        }

        // Month level leave
        if (Array.isArray(mData.leaveRecords)) {
          mData.leaveRecords.forEach((record: any) => {
            if (record && record.id) {
              allLeaveRecordsMap[record.id] = {
                ...record,
                outlet: record.outlet || outletName
              };
            }
          });
        }

        // Month level attendance
        if (mData.dailyAttendance) {
          Object.entries(mData.dailyAttendance).forEach(([dateStr, arr]) => {
            if (Array.isArray(arr)) {
              if (!dailyAttendance[dateStr]) dailyAttendance[dateStr] = [];
              arr.forEach((a: any) => {
                const mapped = { ...a, outlet: a.outlet || outletName };
                if (!dailyAttendance[dateStr].some(e => e.staffId === mapped.staffId)) {
                  dailyAttendance[dateStr].push(mapped);
                }
              });
            }
          });
        }

        // Month level overtime
        if (mData.dailyOvertime) {
          Object.entries(mData.dailyOvertime).forEach(([dateStr, arr]) => {
            if (Array.isArray(arr)) {
              if (!dailyOvertime[dateStr]) dailyOvertime[dateStr] = [];
              arr.forEach((o: any) => {
                const mapped = { ...o, outlet: o.outlet || outletName };
                if (!dailyOvertime[dateStr].some(e => (e.id && e.id === mapped.id) || e.staffId === mapped.staffId)) {
                  dailyOvertime[dateStr].push(mapped);
                }
              });
            }
          });
        }

        // Track added records to avoid duplicate addition from multiple references
        const salesSource = mData.sales?.dailyRecording || mData.dailyRecording || outletData.sales?.dailyRecording || outletData.dailyRecording;
        if (salesSource && typeof salesSource === 'object') {
          Object.entries(salesSource).forEach(([dateStr, dSales]: [string, any]) => {
            if (!dSales) return;
            const outletDateKey = `${outletName}_${dateStr}`;
            if (outletSalesAdded.has(outletDateKey)) return;
            outletSalesAdded.add(outletDateKey);

            if (!aggregatedDailyRecording[dateStr]) {
              aggregatedDailyRecording[dateStr] = {
                date: dateStr,
                revenue: 0,
                covers: 0,
                dineInRevenue: 0,
                takeAwayRevenue: 0,
                goFoodRevenue: 0,
                grabFoodRevenue: 0,
                lunchRevenue: 0,
                dinnerRevenue: 0,
                discLunchPakYudi: 0,
                discDinnerPakYudi: 0,
                discLunchInvestor: 0,
                discDinnerInvestor: 0,
                discLunchInvestor2: 0,
                discDinnerInvestor2: 0,
                discLunchInvestor3: 0,
                discDinnerInvestor3: 0,
                discManagementRevenue: 0,
                bankMegaRevenueLunch: 0,
                bankMegaRevenueDinner: 0,
                digibankRevenueLunch: 0,
                digibankRevenueDinner: 0,
                membershipRevenueLunch: 0,
                membershipRevenueDinner: 0,
                customerSatRevenue: 0,
                totalDiscount: 0,
              };
            }
            const agg = aggregatedDailyRecording[dateStr];
            agg.revenue += (Number(dSales.revenue) || 0);
            agg.covers += (Number(dSales.covers) || 0);
            agg.dineInRevenue += (Number(dSales.dineInRevenue) || 0);
            agg.takeAwayRevenue += (Number(dSales.takeAwayRevenue) || 0);
            agg.goFoodRevenue += (Number(dSales.goFoodRevenue) || 0);
            agg.grabFoodRevenue += (Number(dSales.grabFoodRevenue) || 0);
            agg.lunchRevenue += (Number(dSales.lunchRevenue) || 0);
            agg.dinnerRevenue += (Number(dSales.dinnerRevenue) || 0);
            agg.discLunchPakYudi += (Number(dSales.discLunchPakYudi) || 0);
            agg.discDinnerPakYudi += (Number(dSales.discDinnerPakYudi) || 0);
            agg.discLunchInvestor += (Number(dSales.discLunchInvestor) || 0);
            agg.discDinnerInvestor += (Number(dSales.discDinnerInvestor) || 0);
            agg.discLunchInvestor2 += (Number(dSales.discLunchInvestor2) || 0);
            agg.discDinnerInvestor2 += (Number(dSales.discDinnerInvestor2) || 0);
            agg.discLunchInvestor3 += (Number(dSales.discLunchInvestor3) || 0);
            agg.discDinnerInvestor3 += (Number(dSales.discDinnerInvestor3) || 0);
            agg.discManagementRevenue += (Number(dSales.discManagementRevenue) || 0);
            agg.bankMegaRevenueLunch += (Number(dSales.bankMegaRevenueLunch) || 0);
            agg.bankMegaRevenueDinner += (Number(dSales.bankMegaRevenueDinner) || 0);
            agg.digibankRevenueLunch += (Number(dSales.digibankRevenueLunch) || 0);
            agg.digibankRevenueDinner += (Number(dSales.digibankRevenueDinner) || 0);
            agg.membershipRevenueLunch += (Number(dSales.membershipRevenueLunch) || 0);
            agg.membershipRevenueDinner += (Number(dSales.membershipRevenueDinner) || 0);
            agg.customerSatRevenue += (Number(dSales.customerSatRevenue) || 0);
            agg.totalDiscount += (Number(dSales.totalDiscount) || 0);
          });
        }

        // Aggregate Expenses
        const expSource = mData.expenses || outletData.expenses;
        if (expSource && typeof expSource === 'object') {
          Object.entries(expSource).forEach(([dateStr, exp]: [string, any]) => {
            if (!exp) return;
            const outletDateKey = `${outletName}_${dateStr}`;
            if (outletExpensesAdded.has(outletDateKey)) return;
            outletExpensesAdded.add(outletDateKey);

            if (!aggregatedExpenses[dateStr]) {
              aggregatedExpenses[dateStr] = {
                date: dateStr,
                commodity: 0,
                nonCommodity: 0,
                asset: 0,
                atk: 0,
                casual: 0,
                maintenance: 0,
                thirdParty: 0,
                cash: 0,
                cityLedger: 0,
                complimentary: 0,
                guestSatisfaction: 0,
                chemical: 0,
                mainStore: 0,
                mainKitchen: 0,
                supplierExpense: 0,
                electricity: 0,
                water: 0,
                gas: 0,
                elecLwbpOpen: 0,
                elecLwbpClose: 0,
                elecwbpOpen: 0,
                elecwbpClose: 0,
                waterOpen: 0,
                waterClose: 0,
                gasOpen: 0,
                gasClose: 0,
                items: []
              };
            }
            const aggE = aggregatedExpenses[dateStr];
            aggE.commodity += (Number(exp.commodity) || 0);
            aggE.nonCommodity += (Number(exp.nonCommodity) || 0);
            aggE.asset += (Number(exp.asset) || 0);
            aggE.atk += (Number(exp.atk) || 0);
            aggE.casual += (Number(exp.casual) || 0);
            aggE.maintenance += (Number(exp.maintenance) || 0);
            aggE.thirdParty += (Number(exp.thirdParty) || 0);
            aggE.cash += (Number(exp.cash) || 0);
            aggE.cityLedger += (Number(exp.cityLedger) || 0);
            aggE.complimentary += (Number(exp.complimentary) || 0);
            aggE.guestSatisfaction += (Number(exp.guestSatisfaction) || 0);
            aggE.chemical += (Number(exp.chemical) || 0);
            aggE.mainStore += (Number(exp.mainStore) || 0);
            aggE.mainKitchen += (Number(exp.mainKitchen) || 0);
            aggE.supplierExpense += (Number(exp.supplierExpense) || 0);
            aggE.electricity += (Number(exp.electricity) || 0);
            aggE.water += (Number(exp.water) || 0);
            aggE.gas += (Number(exp.gas) || 0);
            aggE.elecLwbpOpen += (Number(exp.elecLwbpOpen) || 0);
            aggE.elecLwbpClose += (Number(exp.elecLwbpClose) || 0);
            aggE.elecwbpOpen += (Number(exp.elecwbpOpen) || 0);
            aggE.elecwbpClose += (Number(exp.elecwbpClose) || 0);
            aggE.waterOpen += (Number(exp.waterOpen) || 0);
            aggE.waterClose += (Number(exp.waterClose) || 0);
            aggE.gasOpen += (Number(exp.gasOpen) || 0);
            aggE.gasClose += (Number(exp.gasClose) || 0);
            if (Array.isArray(exp.items)) {
              aggE.items.push(...exp.items.map((it: any) => ({ ...it, outlet: it.outlet || outletName })));
            }
          });
        }

        // Aggregate Ledgers
        const mergeLedger = (source: any, target: Record<string, any[]>) => {
          if (!source) return;
          Object.entries(source).forEach(([dateStr, arr]) => {
            if (Array.isArray(arr)) {
              if (!target[dateStr]) target[dateStr] = [];
              target[dateStr].push(...arr.map((it: any) => ({ ...it, outlet: it.outlet || outletName })));
            }
          });
        };

        mergeLedger(mData.dailyNonCommodityLedger, aggregatedNonCommodity);
        mergeLedger(mData.dailyCommodityLedger, aggregatedCommodity);
        mergeLedger(mData.dailyMaintenanceLedger, aggregatedMaintenance);
        mergeLedger(mData.dailyAssetLedger, aggregatedAsset);
        mergeLedger(mData.dailyCasualLedger, aggregatedCasual);
        mergeLedger(mData.dailyAtkLedger, aggregatedAtk);
        mergeLedger(mData.dailyChemicalLedger, aggregatedChemical);
        mergeLedger(mData.dailyCashLedger, aggregatedCashLedger);
        mergeLedger(mData.dailyCityLedger, aggregatedDailyCityLedger);
        mergeLedger(mData.dailyCustomerSat, aggregatedDailyCustomerSat);
        mergeLedger(mData.dailyComplimentary, aggregatedDailyComplimentary);
        mergeLedger(mData.dailyMainStoreLedger, aggregatedMainStore);
        mergeLedger(mData.dailyMainKitchenLedger, aggregatedMainKitchen);
        mergeLedger(mData.dailyGuestSuppliesLedger, aggregatedGuestSupplies);
        mergeLedger(mData.dailyTgifLedger, aggregatedTgif);
        mergeLedger(mData.dailySukandaLedger, aggregatedSukanda);
        mergeLedger(mData.dailyEverestLedger, aggregatedEverest);
        mergeLedger(mData.dailyPanfilaLedger, aggregatedPanfila);
        mergeLedger(mData.dailyIkigaiLedger, aggregatedIkigai);
        mergeLedger(mData.dailyKebunkuLedger, aggregatedKebunku);
        mergeLedger(mData.dailySaungKubilLedger, aggregatedSaungKubil);
        mergeLedger(mData.dailyGasLedger, aggregatedGasLedger);
        mergeLedger(mData.dailyThirdPartyLedger, aggregatedThirdPartyLedger);
        if (mData.energyCost && typeof mData.energyCost === 'object') {
          Object.assign(aggregatedEnergyCost, mData.energyCost);
        }

        // Aggregate weekly overtime if present
        if (mData.weeklyOvertime && typeof mData.weeklyOvertime === 'object') {
          Object.entries(mData.weeklyOvertime).forEach(([wKey, wArr]: [string, any]) => {
            if (Array.isArray(wArr)) {
              if (!aggregatedWeeklyOvertime[wKey]) aggregatedWeeklyOvertime[wKey] = [];
              aggregatedWeeklyOvertime[wKey].push(...wArr.map((wo: any) => ({ ...wo, outlet: wo.outlet || outletName })));
            }
          });
        }

        if (Array.isArray(mData.cityLedger)) {
          aggregatedCityLedger.push(...mData.cityLedger.map((c: any) => ({ ...c, outlet: c.outlet || outletName })));
        }
        if (Array.isArray(mData.customerSat)) {
          aggregatedCustomerSat.push(...mData.customerSat.map((c: any) => ({ ...c, outlet: c.outlet || outletName })));
        }
        if (Array.isArray(mData.complimentary)) {
          aggregatedComplimentary.push(...mData.complimentary.map((c: any) => ({ ...c, outlet: c.outlet || outletName })));
        }

        if (Array.isArray(mData.logisticItems)) {
          mData.logisticItems.forEach((item: any) => {
            if (item && item.id) aggregatedLogisticItemsMap[item.id] = { ...item };
          });
        }
        if (mData.dailyLogisticRecords) {
          Object.entries(mData.dailyLogisticRecords).forEach(([dateStr, recMap]: [string, any]) => {
            if (recMap && typeof recMap === 'object') {
              if (!aggregatedDailyLogisticRecords[dateStr]) aggregatedDailyLogisticRecords[dateStr] = {};
              Object.assign(aggregatedDailyLogisticRecords[dateStr], recMap);
            }
          });
        }
        if (Array.isArray(mData.peminjamanRecords)) {
          mData.peminjamanRecords.forEach((p: any) => {
            if (p && p.id) {
              aggregatedPeminjamanRecords.push({ ...p, outlet: p.outlet || outletName });
            }
          });
        }
        if (mData.logisticBeginningStocks) {
          Object.entries(mData.logisticBeginningStocks).forEach(([pKey, pMap]: [string, any]) => {
            if (pMap && typeof pMap === 'object') {
              if (!aggregatedLogisticBeginningStocks[pKey]) aggregatedLogisticBeginningStocks[pKey] = {};
              Object.assign(aggregatedLogisticBeginningStocks[pKey], pMap);
            }
          });
        }
        if (mData.logisticPeriodPrices) {
          Object.entries(mData.logisticPeriodPrices).forEach(([pKey, pMap]: [string, any]) => {
            if (pMap && typeof pMap === 'object') {
              if (!aggregatedLogisticPeriodPrices[pKey]) aggregatedLogisticPeriodPrices[pKey] = {};
              Object.assign(aggregatedLogisticPeriodPrices[pKey], pMap);
            }
          });
        }

        if (mData.dailyQA) {
          Object.assign(aggregatedDailyQA, mData.dailyQA);
        }
        if (mData.dailyGSI) {
          Object.assign(aggregatedDailyGSI, mData.dailyGSI);
        }
      }
    });
  }

  const activeStaffIds = new Set(Object.keys(allStaffMap));

  // Filter leave records to only active ones
  const filteredLeaveRecords = Object.values(allLeaveRecordsMap).filter((r: any) => activeStaffIds.has(r.staffId));

  // Filter daily attendance
  const filteredDailyAttendance: Record<string, any[]> = {};
  Object.entries(dailyAttendance).forEach(([dateStr, arr]) => {
    filteredDailyAttendance[dateStr] = arr.filter((a: any) => activeStaffIds.has(a.staffId));
  });

  // Filter daily overtime
  const filteredDailyOvertime: Record<string, any[]> = {};
  Object.entries(dailyOvertime).forEach(([dateStr, arr]) => {
    filteredDailyOvertime[dateStr] = arr.filter((o: any) => activeStaffIds.has(o.staffId));
  });

  let totalAggRev = 0;
  let totalAggCov = 0;
  Object.values(aggregatedDailyRecording).forEach((rec: any) => {
    totalAggRev += (rec.revenue || 0);
    totalAggCov += (rec.covers || 0);
  });

  return {
    ...INITIAL_STATE,
    staffList: Object.values(allStaffMap),
    leaveRecords: filteredLeaveRecords,
    dailyAttendance: filteredDailyAttendance,
    dailyOvertime: filteredDailyOvertime,
    sales: {
      ...INITIAL_STATE.sales,
      revenue: totalAggRev,
      covers: totalAggCov,
      dailyRecording: aggregatedDailyRecording
    },
    expenses: aggregatedExpenses,
    dailyNonCommodityLedger: aggregatedNonCommodity,
    dailyCommodityLedger: aggregatedCommodity,
    dailyMaintenanceLedger: aggregatedMaintenance,
    dailyAssetLedger: aggregatedAsset,
    dailyCasualLedger: aggregatedCasual,
    dailyAtkLedger: aggregatedAtk,
    weeklyOvertime: aggregatedWeeklyOvertime,
    dailyChemicalLedger: aggregatedChemical,
    dailyCashLedger: aggregatedCashLedger,
    dailyCityLedger: aggregatedDailyCityLedger,
    cityLedger: aggregatedCityLedger,
    dailyCustomerSat: aggregatedDailyCustomerSat,
    customerSat: aggregatedCustomerSat,
    dailyComplimentary: aggregatedDailyComplimentary,
    complimentary: aggregatedComplimentary,
    dailyMainStoreLedger: aggregatedMainStore,
    dailyMainKitchenLedger: aggregatedMainKitchen,
    dailyGuestSuppliesLedger: aggregatedGuestSupplies,
    dailyTgifLedger: aggregatedTgif,
    dailySukandaLedger: aggregatedSukanda,
    dailyEverestLedger: aggregatedEverest,
    dailyPanfilaLedger: aggregatedPanfila,
    dailyIkigaiLedger: aggregatedIkigai,
    dailyKebunkuLedger: aggregatedKebunku,
    dailySaungKubilLedger: aggregatedSaungKubil,
    dailyGasLedger: aggregatedGasLedger,
    dailyThirdPartyLedger: aggregatedThirdPartyLedger,
    energyCost: aggregatedEnergyCost,
    dailyQA: aggregatedDailyQA,
    dailyGSI: aggregatedDailyGSI,
    guestComplaints: aggregatedComplaints,
    logisticItems: Object.values(aggregatedLogisticItemsMap),
    dailyLogisticRecords: aggregatedDailyLogisticRecords,
    peminjamanRecords: aggregatedPeminjamanRecords,
    logisticBeginningStocks: aggregatedLogisticBeginningStocks,
    logisticPeriodPrices: aggregatedLogisticPeriodPrices,
    manpowerData: aggregatedManpowerData
  };
};
