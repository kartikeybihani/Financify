// ai/extractGoalDetails.ts

export const extractGoalDetails = async (input: string) => {
    const res = await fetch("http://localhost:8080/api/finny/goal-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });
  
    const data = await res.json();
    return {
      label: data.label || null,
      target: data.target || null,
      timeline: data.timeline || null,
    };
  };
  
export default extractGoalDetails;
  