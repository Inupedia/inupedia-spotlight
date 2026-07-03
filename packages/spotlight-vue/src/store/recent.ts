import { RECENT_QUESTIONS_MAX, SPOTLIGHT_RECENT_KEY } from "./constants";

export function loadRecentQuestions(): string[] {
  try {
    const raw = localStorage.getItem(SPOTLIGHT_RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.slice(0, RECENT_QUESTIONS_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentQuestionToList(
  currentQuestions: string[],
  question: string,
): string[] {
  const text = question.trim();
  if (!text) return currentQuestions;
  const list = currentQuestions.filter((q) => q !== text);
  list.unshift(text);
  return list.slice(0, RECENT_QUESTIONS_MAX);
}

export function persistRecentQuestions(questions: string[]): void {
  try {
    localStorage.setItem(SPOTLIGHT_RECENT_KEY, JSON.stringify(questions));
  } catch {
    // ignore
  }
}
