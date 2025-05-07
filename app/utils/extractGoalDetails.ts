// ai/extractGoalDetails.ts

interface Timeline {
  month: string | null;
  year: number | null;
}

interface GoalDetails {
  label: string | null;
  target: number | null;
  timeline: Timeline | null;
}

const BASE_URL = "https://financify-rose.vercel.app";

export const extractGoalDetails = async (input: string): Promise<GoalDetails> => {
  try {
    const res = await fetch(`${BASE_URL}/api/finny/goal-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });
    console.log("Response:", res);

    const data = await res.json();
    console.log("Data:", data);
    return {
      label: data.label || null,
      target: data.target || null,
      timeline: data.timeline || null,
    };
  } catch (error) {
    console.error("Error extracting goal details:", error);
    return {
      label: null,
      target: null,
      timeline: null,
    };
  }
};

export default extractGoalDetails;
  