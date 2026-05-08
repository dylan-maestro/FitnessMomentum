<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let overlayElement: HTMLDivElement | null = null;

  function handleClose() {
    dispatch('close');
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === overlayElement) {
      handleClose();
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

<div
  class="modal-overlay"
  role="presentation"
  tabindex="-1"
  bind:this={overlayElement}
  on:click={handleOverlayClick}
  on:keydown={handleOverlayKeydown}
>
  <div
    class="help-page"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-title"
  >
    <header class="help-header">
      <div class="help-header-copy">
        <p class="eyebrow">Help</p>
        <h2 id="help-title">How FitMo works</h2>
        <p class="intro">
          FitMo is a simple offline workout tracker built around momentum instead of streaks. You add
          exercises, log what you do, and the app turns that training volume into a momentum score and
          a daily target that helps you stay consistent.
        </p>
      </div>
      <button class="close-button" on:click={handleClose} aria-label="Close help">×</button>
    </header>

    <div class="help-body">
      <section class="hero-card">
        <h3>What you are looking at</h3>
        <p>
          Each exercise gets its own card. A card shows your current momentum, how much work you have
          logged today, and how much work is recommended to keep that exercise moving in the right
          direction.
        </p>
        <div class="hero-grid">
          <div class="hero-item">
            <strong>Momentum</strong>
            <span>Your rolling score for that exercise.</span>
          </div>
          <div class="hero-item">
            <strong>Daily target</strong>
            <span>The amount of work recommended for today.</span>
          </div>
          <div class="hero-item">
            <strong>Progress bar</strong>
            <span>How close today’s logged work is to the target.</span>
          </div>
          <div class="hero-item">
            <strong>Quick log</strong>
            <span>The fastest way to record reps, distance, or laps.</span>
          </div>
        </div>
      </section>

      <section class="section-card">
        <h3>Start here</h3>
        <ol>
          <li>Tap <strong>Add Exercise</strong>.</li>
          <li>Pick a template for a fast start, or create a custom exercise.</li>
          <li>Enter a realistic baseline session. This tells FitMo what “normal” looks like for you.</li>
          <li>Choose how often you want to train it, like daily, every 3 days, or weekly.</li>
          <li>Save the exercise, then log your next real session from its card.</li>
        </ol>
      </section>

      <section class="section-card">
        <h3>The core idea: momentum, not streaks</h3>
        <p>
          FitMo does not punish you with a hard reset when you miss a day. Instead, each exercise has a
          momentum score that rises when you train and gradually decays when you do not.
        </p>
        <ul>
          <li>More training volume increases momentum.</li>
          <li>Time away causes momentum to fade smoothly instead of breaking a streak.</li>
          <li>Your target adapts to your chosen training frequency, so a weekly lift is not treated like a daily habit.</li>
        </ul>
      </section>

      <section class="section-card">
        <h3>How logging works</h3>
        <p>
          Every log adds volume to the exercise. FitMo stores the total work for the day and uses that to
          update momentum.
        </p>
        <ul>
          <li><strong>Weight-based exercises:</strong> volume is reps × weight.</li>
          <li><strong>Bodyweight exercises:</strong> your body weight setting is included automatically, with an optional added offset.</li>
          <li><strong>Distance exercises:</strong> volume is total distance, or distance per lap × laps in laps mode.</li>
          <li><strong>Time exercises:</strong> volume is hold time in seconds multiplied by the effective load, so bodyweight and added weight both matter.</li>
          <li>You can log multiple times in the same day and the total keeps accumulating.</li>
        </ul>
      </section>

      <section class="section-card">
        <h3>How the daily target is chosen</h3>
        <p>
          FitMo combines four things to decide what to recommend today: your baseline, your current
          momentum, your training frequency, and your progression setting.
        </p>
        <ul>
          <li><strong>Baseline:</strong> the minimum level of work the app plans around.</li>
          <li><strong>Frequency:</strong> how often you intend to train that exercise.</li>
          <li><strong>Decay:</strong> momentum naturally drops over time, so some work is needed just to maintain.</li>
          <li><strong>Progression:</strong> a small increase can be layered on top so your targets grow gradually.</li>
        </ul>
        <p>
          In practice, that means the target is usually “enough to maintain, plus a little more” when you
          are on schedule.
        </p>
      </section>

      <section class="section-card">
        <h3>Understanding the exercise card</h3>
        <ul>
          <li><strong>Name:</strong> the exercise you are tracking, like Pushups or 5K Run.</li>
          <li><strong>Momentum display:</strong> a quick read on whether that exercise is building, flat, or fading.</li>
          <li><strong>Progress indicator:</strong> shows how much of today’s target you have already completed.</li>
          <li><strong>Target label:</strong> translates the target into something usable, such as reps, distance, or laps.</li>
          <li><strong>Edit and history actions:</strong> let you adjust the setup or inspect the momentum trend in more detail.</li>
        </ul>
      </section>

      <section class="section-card">
        <h3>Weight, bodyweight, distance, and time modes</h3>
        <ul>
          <li><strong>Weighted:</strong> use this when the work is naturally reps × external load, like bench press.</li>
          <li><strong>Bodyweight:</strong> use this for exercises like pushups or pull-ups. FitMo adds your saved body weight automatically.</li>
          <li><strong>Distance simple mode:</strong> enter the total distance for the session.</li>
          <li><strong>Distance laps mode:</strong> enter distance per lap and number of laps when that is easier to think about.</li>
          <li><strong>Time:</strong> use this for static holds like planks and dead hangs. FitMo treats these like weighted work using seconds instead of reps, so longer holds and heavier effective load both increase momentum.</li>
        </ul>
      </section>

      <section class="section-card">
        <h3>Settings and data</h3>
        <ul>
          <li>Set your body weight so bodyweight movements calculate volume correctly.</li>
          <li>Choose kg or lb for weight display, and km or mi for distance display.</li>
          <li>Export your data to a JSON backup file whenever you want a copy.</li>
          <li>Import a backup to restore workouts and settings on the same or another device.</li>
          <li>Your data stays local to the device or browser runtime unless you export it yourself.</li>
        </ul>
      </section>

      <section class="section-card">
        <h3>Good defaults if you are unsure</h3>
        <ul>
          <li>Start with a template.</li>
          <li>Use a baseline session you can complete on an ordinary day, not an all-time best.</li>
          <li>Pick a conservative frequency you can actually maintain.</li>
          <li>Keep progression modest at first so the app nudges you upward instead of overreaching.</li>
        </ul>
      </section>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.48);
    backdrop-filter: blur(3px);
  }

  .help-page {
    width: 100%;
    max-width: 760px;
    max-height: 92vh;
    overflow-y: auto;
    background: #f7f8fa;
    color: #21303c;
    border-radius: 20px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.5rem 1.5rem 1.25rem;
    background: linear-gradient(180deg, #243e51 0%, #2f5168 100%);
    color: white;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .help-header-copy {
    max-width: 44rem;
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.78;
  }

  .help-header h2 {
    margin: 0;
    font-size: 1.65rem;
    line-height: 1.15;
  }

  .intro {
    margin: 0.75rem 0 0;
    font-size: 1rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.92);
  }

  .close-button {
    flex: 0 0 auto;
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .help-body {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  .hero-card,
  .section-card {
    background: white;
    border: 1px solid #e3e8ed;
    border-radius: 16px;
    padding: 1.15rem 1.15rem 1.2rem;
    box-shadow: 0 6px 20px rgba(36, 62, 81, 0.06);
  }

  .hero-card h3,
  .section-card h3 {
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
    color: #243e51;
  }

  .hero-card p,
  .section-card p {
    margin: 0;
    color: #50616e;
    line-height: 1.6;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .hero-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.85rem 0.9rem;
    border-radius: 12px;
    background: #f3f6f8;
    border: 1px solid #e3e8ed;
  }

  .hero-item strong {
    color: #243e51;
    font-size: 0.95rem;
  }

  .hero-item span {
    color: #5a6b78;
    line-height: 1.45;
    font-size: 0.9rem;
  }

  ol,
  ul {
    margin: 0.75rem 0 0;
    padding-left: 1.2rem;
    color: #50616e;
  }

  li + li {
    margin-top: 0.45rem;
  }

  strong {
    color: #243e51;
  }

  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0;
    }

    .help-page {
      max-width: none;
      max-height: var(--app-height, 100dvh);
      height: var(--app-height, 100dvh);
      border-radius: 0;
    }

    .help-header {
      padding-top: calc(1rem + var(--android-safe-area-top, env(safe-area-inset-top, 0px)));
    }

    .hero-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
