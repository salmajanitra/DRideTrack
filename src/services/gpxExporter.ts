import { ActivityRecord, GPSPoint } from '../types/cycling';

/**
 * Generates a standard Garmin/Strava-compliant GPX 1.1 XML string from an ActivityRecord
 */
export function generateGPXString(activity: ActivityRecord): string {
  const { title, startTime, points, stats, notes } = activity;

  const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  };

  const timeIso = new Date(startTime).toISOString();
  const validPoints = points.filter(
    (p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
  );

  let boundsXml = '';
  if (validPoints.length > 0) {
    let minLat = validPoints[0].lat;
    let maxLat = validPoints[0].lat;
    let minLng = validPoints[0].lng;
    let maxLng = validPoints[0].lng;

    for (const p of validPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    boundsXml = `    <bounds minlat="${minLat.toFixed(6)}" minlon="${minLng.toFixed(6)}" maxlat="${maxLat.toFixed(
      6
    )}" maxlon="${maxLng.toFixed(6)}" />\n`;
  }

  const desc = notes
    ? `${notes} | Dhefin Ride Track GPS - Jarak: ${stats.distanceKm.toFixed(2)} km, Elev: +${stats.elevationGainM}m, Rata-rata: ${stats.avgSpeedKmH.toFixed(1)} km/h`
    : `Recorded with Dhefin Ride Track GPS. Distance: ${stats.distanceKm.toFixed(2)} km, Elev Gain: ${stats.elevationGainM} m, Avg Speed: ${stats.avgSpeedKmH.toFixed(1)} km/h, Max Speed: ${stats.maxSpeedKmH.toFixed(1)} km/h`;

  const trackPointsXml = validPoints
    .map((pt) => {
      const ptTimeIso = new Date(pt.timestamp).toISOString();
      const eleXml = pt.altitude !== null && !isNaN(pt.altitude) ? `\n        <ele>${pt.altitude.toFixed(1)}</ele>` : '';
      const speedMs = (Math.max(0, pt.speed) / 3.6).toFixed(2);

      return `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${eleXml}
        <time>${ptTimeIso}</time>
        <extensions>
          <speed>${speedMs}</speed>
          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
            <gpxtpx:speed>${speedMs}</gpxtpx:speed>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Dhefin Ride Track GPS - https://ridetrack.app"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${escapeXml(title)}</name>
    <desc>${escapeXml(desc)}</desc>
    <time>${timeIso}</time>
${boundsXml}  </metadata>
  <trk>
    <name>${escapeXml(title)}</name>
    <desc>${escapeXml(desc)}</desc>
    <type>${activity.sportType === 'running' ? 'Running' : 'Cycling'}</type>
    <trkseg>
${trackPointsXml}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Downloads a single activity as a .gpx file
 */
export function exportActivityToGPX(activity: ActivityRecord, customFilename?: string): void {
  const gpxContent = generateGPXString(activity);
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const cleanFilename =
    customFilename ||
    `${activity.title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'ride'}_${new Date(activity.startTime)
      .toISOString()
      .slice(0, 10)}.gpx`;

  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFilename.endsWith('.gpx') ? cleanFilename : `${cleanFilename}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports all activities into a single multi-track GPX backup file
 */
export function exportAllActivitiesToGPX(activities: ActivityRecord[], archiveName: string = 'dhefin_ride_track_all_rides.gpx'): void {
  if (activities.length === 0) return;

  const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  };

  const tracksXml = activities
    .map((act) => {
      const validPoints = act.points.filter(
        (p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
      );

      const ptsXml = validPoints
        .map((pt) => {
          const eleXml = pt.altitude !== null ? `\n          <ele>${pt.altitude.toFixed(1)}</ele>` : '';
          const speedMs = (Math.max(0, pt.speed) / 3.6).toFixed(2);
          return `        <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${eleXml}
          <time>${new Date(pt.timestamp).toISOString()}</time>
          <extensions>
            <speed>${speedMs}</speed>
          </extensions>
        </trkpt>`;
        })
        .join('\n');

      return `    <trk>
      <name>${escapeXml(act.title)}</name>
      <desc>Distance: ${act.stats.distanceKm.toFixed(2)} km, Elev: +${act.stats.elevationGainM}m</desc>
      <type>Cycling</type>
      <trkseg>
${ptsXml}
      </trkseg>
    </trk>`;
    })
    .join('\n');

  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Dhefin Ride Track GPS - Master Archive"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Dhefin Ride Track GPS - Koleksi Aktivitas Bersepeda</name>
    <desc>Total ${activities.length} aktivitas tersimpan.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${tracksXml}
</gpx>`;

  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archiveName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
