export function shouldStartTrial({ authenticated, trialStartedAt }) {
  return Boolean(authenticated && !trialStartedAt);
}
