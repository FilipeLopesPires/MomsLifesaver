package expo.modules.medianotification

import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * A [Player] that owns no audio.
 *
 * `androidx.media3.session.MediaSession` requires a Player, but nothing
 * requires that Player to produce sound. That is the entire design:
 *
 *   - AudioFocus in media3 is requested by `ExoPlayer` when it is configured
 *     with `setAudioAttributes(attrs, handleAudioFocus = true)`. There is no
 *     ExoPlayer here, no AudioAttributes, and no AudioManager - so this player
 *     never requests focus, and expo-audio (which produces the real audio)
 *     keeps it uncontested.
 *   - Because there is no focus to steal, the session state can be repainted
 *     on every playback change. That is what makes the notification's
 *     play/pause icon honest, which the previous track-player-based design
 *     could not do.
 *
 * DO NOT add an ExoPlayer, AudioAttributes, or AudioManager here. Any of the
 * three reintroduces the focus war this module exists to end.
 *
 * State is push-only: [setMetadata] is the sole mutator, and the remote
 * commands ([handleSetPlayWhenReady], [handleStop]) deliberately do *not*
 * mutate it. They forward the request to JS, which owns playback truth and
 * calls back with the real result. An optimistic local flip is exactly how the
 * icon starts lying.
 */
@UnstableApi
class StubPlayer(
  initialTitle: String,
  initialArtist: String,
  private val onPlayWhenReadyRequest: (Boolean) -> Unit,
  private val onStopRequest: () -> Unit,
) : SimpleBasePlayer(Looper.getMainLooper()) {

  private var title: String = initialTitle
  private var artist: String = initialArtist
  private var isPlaying: Boolean = false

  /** Main thread only - [invalidateState] verifies the application thread. */
  fun setMetadata(title: String, artist: String, isPlaying: Boolean) {
    this.title = title
    this.artist = artist
    this.isPlaying = isPlaying
    invalidateState()
  }

  override fun getState(): State {
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .build()

    val mediaItem = MediaItem.Builder()
      .setMediaId(MEDIA_ITEM_UID)
      .setMediaMetadata(metadata)
      .build()

    // Duration is left unset (C.TIME_UNSET) so the system media controls
    // render no seek bar - there is nothing to seek in a continuous mix.
    val item = MediaItemData.Builder(MEDIA_ITEM_UID)
      .setMediaItem(mediaItem)
      .setMediaMetadata(metadata)
      .setIsSeekable(false)
      .setIsDynamic(false)
      .build()

    return State.Builder()
      .setAvailableCommands(AVAILABLE_COMMANDS)
      // Never STATE_IDLE: media3 hides the notification for an idle player.
      .setPlaybackState(Player.STATE_READY)
      .setPlayWhenReady(isPlaying, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaylist(listOf(item))
      .setCurrentMediaItemIndex(0)
      .setContentPositionMs(0L)
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    onPlayWhenReadyRequest(playWhenReady)
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    onStopRequest()
    return Futures.immediateVoidFuture()
  }

  override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()

  private companion object {
    const val MEDIA_ITEM_UID = "moms-lifesaver-mix"

    /**
     * Deliberately narrow. The three GET_* commands are not cosmetic:
     * media3's notification manager reads the timeline and metadata through a
     * MediaController, and a command it was not granted comes back empty -
     * an absent COMMAND_GET_TIMELINE means no notification at all, silently.
     *
     * PLAY_PAUSE is what draws the button; STOP is what Bluetooth headsets and
     * the lock screen send. No seek/next/previous: this is one mix, not a
     * playlist (see the plan's non-goals).
     */
    val AVAILABLE_COMMANDS: Player.Commands = Player.Commands.Builder()
      .addAll(
        Player.COMMAND_PLAY_PAUSE,
        Player.COMMAND_STOP,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_TIMELINE,
        Player.COMMAND_GET_METADATA,
        Player.COMMAND_RELEASE,
      )
      .build()
  }
}
