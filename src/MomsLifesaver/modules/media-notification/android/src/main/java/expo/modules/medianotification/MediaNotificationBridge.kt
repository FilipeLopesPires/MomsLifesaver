package expo.modules.medianotification

import android.os.Handler
import android.os.Looper

/**
 * Handoff between [MediaNotificationModule] (JS thread) and
 * [MediaNotificationService] (main thread).
 *
 * The two have no direct reference to each other: Android owns the service's
 * lifecycle, so the module cannot hold one, and the service is created
 * asynchronously after `start()` returns. This object holds the last state JS
 * pushed so the service can seed itself from it whenever it happens to come
 * up, and routes remote-control commands back the other way.
 */
object MediaNotificationBridge {

  const val EVENT_TOGGLE_PLAY_PAUSE = "onTogglePlayPause"
  const val EVENT_STOP = "onStop"
  const val EVENT_TICK = "onSleepTimerTick"

  const val DEFAULT_TITLE = "Mom's Lifesaver"
  const val DEFAULT_ARTIST = "Ready to play"

  data class Metadata(val title: String, val artist: String, val isPlaying: Boolean)

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  var metadata: Metadata = Metadata(DEFAULT_TITLE, DEFAULT_ARTIST, false)
    private set

  /** Main thread only. Null whenever the service is not running. */
  private var service: MediaNotificationService? = null

  /** Set while the JS runtime owning the module is alive. */
  @Volatile
  var onRemoteCommand: ((event: String, playWhenReady: Boolean) -> Unit)? = null

  /**
   * Set while the JS runtime owning the module is alive. Fired by
   * [tickRunnable] on the cadence given to [startTicking].
   */
  @Volatile
  var onTick: (() -> Unit)? = null

  private var tickIntervalMs: Long = 0L

  @Volatile
  private var ticking = false

  // Self-rescheduling: only reposts while `ticking` is true, so a single
  // stopTicking() call is enough to end the chain rather than needing to
  // track/cancel a fresh Runnable each cycle.
  private val tickRunnable = object : Runnable {
    override fun run() {
      if (!ticking) return
      onTick?.invoke()
      mainHandler.postDelayed(this, tickIntervalMs)
    }
  }

  /**
   * Starts (or re-cadences) the periodic [EVENT_TICK] emission, driven by a
   * plain main-looper [Handler] rather than a JS timer - this is what keeps
   * the sleep-timer fade advancing while the app is backgrounded, since React
   * Native stops dispatching JS `setInterval` callbacks the instant the host
   * activity pauses, independent of this module's foreground service.
   */
  fun startTicking(intervalMs: Long) {
    tickIntervalMs = intervalMs
    if (ticking) return
    ticking = true
    mainHandler.postDelayed(tickRunnable, tickIntervalMs)
  }

  /** Safe to call even when not currently ticking. */
  fun stopTicking() {
    ticking = false
    mainHandler.removeCallbacks(tickRunnable)
  }

  fun setMetadata(title: String, artist: String, isPlaying: Boolean) {
    metadata = Metadata(title, artist, isPlaying)
    // Called from the JS thread; the player's state may only be touched on the
    // application looper.
    mainHandler.post { service?.applyMetadata() }
  }

  fun reset() = setMetadata(DEFAULT_TITLE, DEFAULT_ARTIST, false)

  fun attach(service: MediaNotificationService) {
    this.service = service
  }

  fun detach(service: MediaNotificationService) {
    // Guarded so a stale onDestroy cannot unhook a service that has already
    // been replaced by a restart.
    if (this.service === service) {
      this.service = null
    }
  }

  fun emitTogglePlayPause(playWhenReady: Boolean) {
    onRemoteCommand?.invoke(EVENT_TOGGLE_PLAY_PAUSE, playWhenReady)
  }

  fun emitStop() {
    onRemoteCommand?.invoke(EVENT_STOP, false)
  }
}
