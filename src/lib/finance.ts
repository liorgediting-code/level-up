// Shared client financial computations (revenue, expenses, and Lior's profit split).
// Lior's payout uses two independent percentages agreed per client:
//   liorRevenueSharePct — Lior's cut of income actually received (paid)
//   liorExpenseSharePct — Lior's participation in the client's expenses
// Amount owed to Lior = (revPct% × paid) − (expPct% × expenses).

export type PaymentLike = { type: string; amount: number };

const PAYMENT_TYPES = ["closed", "paid", "owed", "expense", "lior_paid"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_TYPE_VALUES = PAYMENT_TYPES;

function sumByType(payments: PaymentLike[], type: string) {
  return payments.filter((p) => p.type === type).reduce((s, p) => s + p.amount, 0);
}

export function summarizeClientFinance(
  payments: PaymentLike[],
  liorRevenueSharePct: number | null | undefined,
  liorExpenseSharePct: number | null | undefined,
) {
  const closed = sumByType(payments, "closed");
  const paid = sumByType(payments, "paid");
  const owed = sumByType(payments, "owed");
  const expenses = sumByType(payments, "expense");
  const liorPaid = sumByType(payments, "lior_paid");

  const outstanding = closed - paid; // invoiced minus collected

  const revPct = liorRevenueSharePct ?? 0;
  const expPct = liorExpenseSharePct ?? 0;
  const liorRevenueShare = (revPct / 100) * paid;
  const liorExpenseShare = (expPct / 100) * expenses;
  const liorOwed = liorRevenueShare - liorExpenseShare; // net entitlement
  const liorToPay = liorOwed - liorPaid; // still to transfer to Lior

  return {
    closed,
    paid,
    owed,
    expenses,
    outstanding,
    liorPaid,
    liorRevenueShare,
    liorExpenseShare,
    liorOwed,
    liorToPay,
  };
}
