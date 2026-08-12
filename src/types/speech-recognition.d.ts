// Browser SpeechRecognitionResult is array-like but also exposes isFinal.
// BuddyLiveChat's lightweight local interface uses ArrayLike for compatibility;
// this declaration preserves the runtime property without requiring DOM vendor typings.
interface ArrayLike<T> {
  readonly isFinal?: boolean;
}
