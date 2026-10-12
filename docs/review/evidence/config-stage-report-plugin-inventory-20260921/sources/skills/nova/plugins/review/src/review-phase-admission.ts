export class ReviewPhaseAdmissionError extends Error {}

/** Synchronous reservations are atomic between concurrent async dispatches. */
export class ReviewPhaseAdmission {
  #remainingRetries: number;
  constructor(maximumRetries: number) { this.#remainingRetries = maximumRetries; }
  retry(): void {
    if (this.#remainingRetries < 1) throw new ReviewPhaseAdmissionError('review phase shared retry budget exhausted');
    this.#remainingRetries -= 1;
  }
  static requireJobs(count: number, maximum: number): void {
    if (count > maximum) throw new ReviewPhaseAdmissionError(`review phase job budget exceeded: ${count} > ${maximum}`);
  }
}
