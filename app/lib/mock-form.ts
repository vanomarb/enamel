import { isEmail, parseContact } from './account.ts'

/** What a field holds, without the DOM, so the checks can be tested. */
export interface FieldInput {
  name: string
  required: boolean
  value: string
}

const MISSING: Record<string, string> = {
  email: 'Enter your email address.',
  name: 'Enter your name.',
  reply: 'Enter an email address or a mobile number so we could reply.',
  message: 'Write your message.',
}

export function fieldProblem({ name, required, value }: FieldInput): string | null {
  const text = value.trim()
  if (required && !text) return MISSING[name] ?? 'Fill in this field.'
  if (name === 'email' && text && !isEmail(text)) return 'Enter an email address, like name@example.com.'
  if (name === 'reply' && text && !parseContact(text)) return 'Enter an email address or a mobile number starting with 09.'
  return null
}

export function formProblems(fields: FieldInput[]): Record<string, string> {
  const problems: Record<string, string> = {}
  for (const field of fields) {
    const problem = fieldProblem(field)
    if (problem) problems[field.name] = problem
  }
  return problems
}
