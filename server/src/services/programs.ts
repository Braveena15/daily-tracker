// Loading a user's programs. Every query is limited to the user's own id.
import { ProgramModel } from "../models/Program";
import { todayInTimezone } from "../utils/dates";
import { plannedEndDate } from "../utils/program";

/** The earliest start date of any of the user's programs (the History floor), or null. */
export async function earliestProgramStart(userId: string | undefined): Promise<string | null> {
  const first = await ProgramModel.findOne({ userId }).sort({ startDate: 1 }).select("startDate").lean();
  return first?.startDate ?? null;
}

/**
 * The active program, or null. One whose last day has passed is marked "completed" here (status is
 * settled when read, so no background job is needed) and null is returned.
 */
export async function activeProgram(userId: string | undefined, today: string = todayInTimezone()) {
  const program = await ProgramModel.findOne({ userId, status: "active" });
  if (!program) return null;
  if (today > plannedEndDate(program.startDate, program.lengthDays)) {
    await ProgramModel.updateOne({ _id: program._id, status: "active" }, { $set: { status: "completed" } });
    return null;
  }
  return program;
}
