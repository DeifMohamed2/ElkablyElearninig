/**
 * Normalize Bunny Stream recording fields for the student mobile API only:
 * single-line iframe (same shape as test.html) for recordingUrl, and plain
 * mediadelivery embed URL for bunnyVideoUrl — built from IDs / parsed URLs so
 * the JSON string is clean (no stored backslash-escaping artifacts).
 */

const EMBED_QUERY = 'autoplay=true&loop=false&muted=false&preload=true&responsive=true';

function buildEmbedUrl(libraryId, videoId) {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?${EMBED_QUERY}`;
}

function buildRecordingIframeHtml(embedUrl) {
  return `<iframe src="${embedUrl}" loading="lazy" style="border:0;position:absolute;top:0;height:100%;width:100%;" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" allowfullscreen="true"></iframe>`;
}

function resolveBunnyLibraryAndVideoId(zmLike) {
  if (!zmLike || typeof zmLike !== 'object') return null;
  const envLib = process.env.BUNNY_LIBRARY_ID && String(process.env.BUNNY_LIBRARY_ID).trim();
  if (zmLike.bunnyVideoId && envLib) {
    return { libraryId: envLib, videoId: String(zmLike.bunnyVideoId).trim() };
  }
  const text = [zmLike.recordingUrl, zmLike.bunnyVideoUrl].filter(Boolean).join(' ');
  const embed = text.match(/iframe\.mediadelivery\.net\/embed\/(\d+)\/([a-f0-9-]+)/i);
  if (embed) return { libraryId: embed[1], videoId: embed[2] };
  const cdn = text.match(/vz-(\d+)\.b-cdn\.net\/([a-f0-9-]+)\//i);
  if (cdn) return { libraryId: cdn[1], videoId: cdn[2] };
  return null;
}

function normalizeZoomMeetingForMobile(meeting) {
  if (!meeting || typeof meeting !== 'object') return meeting;
  const ids = resolveBunnyLibraryAndVideoId(meeting);
  if (!ids) return meeting;
  const embedUrl = buildEmbedUrl(ids.libraryId, ids.videoId);
  return {
    ...meeting,
    recordingUrl: buildRecordingIframeHtml(embedUrl),
    bunnyVideoUrl: embedUrl,
  };
}

/**
 * Adjust JSON bodies from shared studentController handlers when called from mobile.
 */
function normalizeMobileZoomJsonPayload(body) {
  if (!body || typeof body !== 'object') return body;
  if (typeof body.recordingUrl === 'string') {
    const ids = resolveBunnyLibraryAndVideoId({ recordingUrl: body.recordingUrl });
    if (!ids) return body;
    const embedUrl = buildEmbedUrl(ids.libraryId, ids.videoId);
    return {
      ...body,
      recordingUrl: buildRecordingIframeHtml(embedUrl),
      bunnyVideoUrl: embedUrl,
    };
  }
  if (Array.isArray(body.history)) {
    return {
      ...body,
      history: body.history.map((row) => {
        if (!row.meeting) return row;
        return {
          ...row,
          meeting: normalizeZoomMeetingForMobile(row.meeting),
        };
      }),
    };
  }
  return body;
}

function wrapResJsonWithMobileBunnyRecording(handler) {
  return async (req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = (body) => {
      res.json = origJson;
      return origJson(normalizeMobileZoomJsonPayload(body));
    };
    try {
      await handler(req, res, next);
    } finally {
      res.json = origJson;
    }
  };
}

module.exports = {
  normalizeZoomMeetingForMobile,
  normalizeMobileZoomJsonPayload,
  wrapResJsonWithMobileBunnyRecording,
  buildEmbedUrl,
  buildRecordingIframeHtml,
  resolveBunnyLibraryAndVideoId,
};
