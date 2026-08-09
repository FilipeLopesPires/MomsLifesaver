package expo.modules.medianotification

import android.content.Context
import android.content.Intent
import androidx.core.os.bundleOf
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing surface of the media-notification module.
 *
 * `hooks/use-foreground-service.ts` is the only caller.
 */
class MediaNotificationModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MediaNotification")

    Events(MediaNotificationBridge.EVENT_TOGGLE_PLAY_PAUSE, MediaNotificationBridge.EVENT_STOP)

    OnCreate {
      MediaNotificationBridge.onRemoteCommand = { event, playWhenReady ->
        sendEvent(event, bundleOf("playWhenReady" to playWhenReady))
      }
    }

    OnDestroy {
      MediaNotificationBridge.onRemoteCommand = null
    }

    Function("start") { title: String, artist: String, isPlaying: Boolean ->
      // Seed before the service exists: it reads the bridge in onCreate.
      MediaNotificationBridge.setMetadata(title, artist, isPlaying)

      // startService, NOT startForegroundService. media3 promotes the service
      // itself once the session reports playback; a startForegroundService()
      // we never follow with a matching startForeground() within 5s would
      // crash. The trade-off is that this must be called while the app is in
      // the foreground - which it is, since only a user tap gets here.
      context.startService(serviceIntent())
    }

    Function("update") { title: String, artist: String, isPlaying: Boolean ->
      MediaNotificationBridge.setMetadata(title, artist, isPlaying)
    }

    Function("stop") {
      context.stopService(serviceIntent())
      MediaNotificationBridge.reset()
    }
  }

  private fun serviceIntent() = Intent(context, MediaNotificationService::class.java)
}
