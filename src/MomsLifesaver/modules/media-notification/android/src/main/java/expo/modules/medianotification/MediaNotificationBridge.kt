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
