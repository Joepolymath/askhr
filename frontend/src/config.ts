// Single place to rename the product in the UI (backend: app/config.py PRODUCT_NAME).
// The company name is not here: it comes from Admin › Company info.
export const PRODUCT_NAME = "AskHR";

// Starter questions on the empty chat. "{company}" is replaced with the company name.
// Keep them to things your published documents actually answer.
export const STARTER_QUESTIONS: { question: string; topic: string }[] = [
  { question: "What is the leave policy?", topic: "Leave" },
  { question: "How do I request time off?", topic: "Leave" },
  { question: "Who is the CEO?", topic: "People" },
  { question: "What does {company} do?", topic: "Company" },
  { question: "How many sick days do I get?", topic: "Leave" },
  { question: "Who should I contact in HR?", topic: "People" },
];

export function starterQuestions(company: string) {
  return STARTER_QUESTIONS.map((s) => ({
    ...s,
    question: s.question.replace("{company}", company || "the company"),
  }));
}
