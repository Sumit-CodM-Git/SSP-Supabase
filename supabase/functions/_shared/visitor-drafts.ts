export class VisitorDraftError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function isVisitorOtpDraft(row: any): boolean {
  return row?.role === "visitor" && row.name === "Unknown Visitor" &&
    ["otp_pending", "pending"].includes(String(row.visitor_status ?? "").toLowerCase()) &&
    !row.check_in && !row.check_out && !row.pre_approved &&
    ["", "pending"].includes(String(row.visitor_approval_status ?? "").toLowerCase());
}

// A resident may decide before security finishes the name/details form.
export function canCompleteVisitorDetails(row: any): boolean {
  return row?.role === "visitor" && row.name === "Unknown Visitor" && row.is_otp_verified === true &&
    !row.check_in && !row.check_out &&
    ["otp_pending", "pending", "approved", "rejected"].includes(String(row.visitor_status ?? "").toLowerCase());
}

export async function findVisitorDraft(client: any, residentId: string, societyId: string,
  phone: string | null, visitorId?: string | null): Promise<any | null> {
  let query = client.from("SSP_Non_Society_User").select("*")
    .eq("hosted_by", residentId).eq("society", societyId);
  if (visitorId) {
    const { data, error } = await query.eq("non_society_user_id", visitorId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new VisitorDraftError("Visitor does not belong to the selected resident and society.", 403);
    if (phone && data.phone_number !== phone) throw new VisitorDraftError("Phone number does not match the selected visitor.");
    return data;
  }
  if (!phone) return null;
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await query.eq("phone_number", phone).eq("role", "visitor")
    .eq("name", "Unknown Visitor")
    .is("check_in", null).is("check_out", null)
    .or(`and(pre_approved.eq.false,or(visitor_status.eq.otp_pending,and(visitor_status.ilike.pending,created_at.gte.${cutoff}))),and(is_otp_verified.eq.true,visitor_status.in.(pending,Pending,approved,Approved,rejected,Rejected))`)
    .order("created_at", { ascending: false }).limit(2);
  if (error) throw new Error(error.message);
  const drafts = (data ?? []).filter((row: any) => isVisitorOtpDraft(row) || canCompleteVisitorDetails(row));
  const canonical = drafts.filter((row: any) => row.visitor_status === "otp_pending");
  if (canonical.length === 1) return canonical[0];
  if (drafts.length > 1) throw new VisitorDraftError("Multiple unfinished visitor requests exist. Please provide the visitorId returned by visitor-otp.", 409);
  return drafts[0] ?? null;
}

export function canVerifyVisitorOtp(row: any): boolean {
  return row?.role === "visitor" && !row.check_in && !row.check_out &&
    ["otp_pending", "pending", "expected", "approved"].includes(String(row.visitor_status ?? "").toLowerCase()) &&
    ["", "pending", "approved"].includes(String(row.visitor_approval_status ?? "").toLowerCase());
}

// Some app versions create the named visitor before opening the OTP screen.
export async function findPendingVisitorForOtp(client: any, residentId: string, societyId: string, phone: string) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await client.from("SSP_Non_Society_User").select("*")
    .eq("hosted_by", residentId).eq("society", societyId).eq("phone_number", phone)
    .eq("role", "visitor").eq("pre_approved", false).neq("name", "Unknown Visitor")
    .is("check_in", null).is("check_out", null).ilike("visitor_status", "pending")
    .gte("created_at", cutoff).order("created_at", { ascending: false }).limit(2);
  if (error) throw new Error(error.message);
  const visitors = (data ?? []).filter(canVerifyVisitorOtp);
  if (visitors.length > 1) throw new VisitorDraftError("Multiple pending visits exist. Provide the visitorId for this visit.", 409);
  return visitors[0] ?? null;
}
