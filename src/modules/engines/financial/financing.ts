import { round2 } from "@/modules/core/math";
import type { FinancingInstrument } from "./types";

export interface ScheduleMonth {
  month: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

/** French amortization payment for a principal over n months at monthly rate r. */
export function annuityPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return principal;
  if (monthlyRate === 0) return principal / months;
  const f = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * f) / (f - 1);
}

export interface InstrumentSchedule {
  instrument: FinancingInstrument;
  principal: number;
  arrangementFee: number;
  months: ScheduleMonth[]; // months drawMonth+1 .. exitMonth
  interestTotal: number;
  outstandingAtExit: number;
}

export function sizeInstrument(
  instrument: FinancingInstrument,
  ctx: { purchasePrice: number; totalCostBeforeFinancing: number },
): number {
  const s = instrument.sizing;
  if (s.type === "amount") return Math.max(0, s.amount);
  if (s.type === "ltv") return Math.max(0, ctx.purchasePrice * s.ratio);
  return Math.max(0, ctx.totalCostBeforeFinancing * s.ratio);
}

/**
 * Build the month-by-month schedule of an instrument between its draw and the
 * exit month. Whatever balance remains at exit is repaid as a bullet.
 */
export function buildSchedule(
  instrument: FinancingInstrument,
  principal: number,
  exitMonth: number,
): InstrumentSchedule {
  const r = instrument.annualRate / 12;
  const arrangementFee = round2(principal * instrument.arrangementFeeRate);
  const months: ScheduleMonth[] = [];
  let balance = principal;
  const payment = instrument.interestOnly ? 0 : annuityPayment(principal, r, instrument.termMonths);
  let interestTotal = 0;
  for (let m = instrument.drawMonth + 1; m <= exitMonth; m++) {
    if (balance <= 0) break;
    const interest = balance * r;
    let principalPaid = 0;
    if (!instrument.interestOnly) principalPaid = Math.min(balance, payment - interest);
    balance = balance - principalPaid;
    interestTotal += interest;
    months.push({
      month: m,
      interest: round2(interest),
      principal: round2(principalPaid),
      payment: round2(interest + principalPaid),
      balance: round2(balance),
    });
  }
  return {
    instrument,
    principal: round2(principal),
    arrangementFee,
    months,
    interestTotal: round2(interestTotal),
    outstandingAtExit: round2(balance),
  };
}
