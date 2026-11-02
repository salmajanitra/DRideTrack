import { DigitalRoute, DigitalRoutePoint, MapStyle } from '../types/cycling';
import { latLngToTile, getTileKey, MAP_LAYERS, DownloadProgress } from './offlineTiles';
import { saveTile, saveOfflineRoute, getOfflineRoutes } from './db';

// Helper to calculate great-circle distance between two coords in km (Haversine)
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper to determine climb categorization based on distance (km) and gradient (%)
export function calculateClimbCategory(
  elevationGainM: number,
  maxGradient: number,
  distanceKm: number
): 'Cat 4' | 'Cat 3' | 'Cat 2' | 'Cat 1' | 'HC' | 'Datar / Flat' {
  if (elevationGainM < 60) return 'Datar / Flat';
  // UCI-based climbing index: Distance(m) * Gradient^2
  const avgGrad = (elevationGainM / (distanceKm * 1000)) * 100;
  const climbScore = distanceKm * 1000 * Math.pow(avgGrad / 100, 2);

  if (climbScore > 80000 || (elevationGainM > 900 && maxGradient > 12)) return 'HC';
  if (climbScore > 45000 || (elevationGainM > 600 && maxGradient > 10)) return 'Cat 1';
  if (climbScore > 25000 || (elevationGainM > 350 && maxGradient > 8)) return 'Cat 2';
  if (climbScore > 10000 || (elevationGainM > 180 && maxGradient > 6)) return 'Cat 3';
  return 'Cat 4';
}

// Calculate gradient % given altitude change (m) and distance delta (km)
export function calculateGradient(altDeltaM: number, distanceDeltaKm: number): number {
  if (distanceDeltaKm <= 0.005) return 0; // Avoid division by near-zero
  const grad = (altDeltaM / (distanceDeltaKm * 1000)) * 100;
  return Math.round(grad * 10) / 10;
}

// -------------------------------------------------------------
// Curated Real-World Road Bike Routes with Digital DEM Profiles
// -------------------------------------------------------------

export const CURATED_ROAD_BIKE_ROUTES: DigitalRoute[] = [
  {
    id: 'curated-monas-sudirman',
    title: 'Monas – Sudirman – GBK Senayan Loop',
    subtitle: 'Rute Pelatnas Road Bike Jakarta (Aero Flat & Fast)',
    description: 'Jalur primadona road bike ibukota dengan aspal mulus hotmix, jalur sepeda terproteksi, jalan lebar multi-lajur, serta minim hambatan tanjakan. Sangat ideal untuk latihan sprint, paceline peleton, dan cadence tinggi.',
    category: 'curated',
    difficulty: 'Mudah (Datar)',
    climbCategory: 'Datar / Flat',
    distanceKm: 22.4,
    elevationGainM: 58,
    elevationLossM: 58,
    maxGradientPercent: 2.1,
    avgGradientPercent: 0.4,
    minAltitudeM: 10,
    maxAltitudeM: 26,
    estimatedTimeMinutes: 45,
    surfaceSuitability: {
      smoothAsphaltPercent: 95,
      bikeLanePercent: 85,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '05:00 – 07:30 WIB (Pagi hari sebelum jam kantor)',
    bounds: {
      north: -6.170,
      south: -6.230,
      east: 106.835,
      west: 106.800,
    },
    points: [
      { lat: -6.1754, lng: 106.8272, altitude: 14, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: Monumen Nasional (Cawan Barat)' },
      { lat: -6.1820, lng: 106.8245, altitude: 14, distanceKm: 0.8, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Jl. Medan Merdeka Barat' },
      { lat: -6.1895, lng: 106.8236, altitude: 15, distanceKm: 1.7, gradientPercent: 0.1, surface: 'smooth_asphalt', name: 'Simpang Bank Indonesia' },
      { lat: -6.1950, lng: 106.8231, altitude: 16, distanceKm: 2.4, gradientPercent: 0.1, surface: 'smooth_asphalt', name: 'Bundaran HI (Putaran Air Mancur)' },
      { lat: -6.2030, lng: 106.8219, altitude: 18, distanceKm: 3.4, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Flyover Karet (Underpass / Jalan Utama)' },
      { lat: -6.2110, lng: 106.8198, altitude: 20, distanceKm: 4.4, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Dukuh Atas Interchange' },
      { lat: -6.2200, lng: 106.8142, altitude: 24, distanceKm: 5.8, gradientPercent: 0.3, surface: 'smooth_asphalt', name: 'Semanggi Flyover (Jalur Arteri)' },
      { lat: -6.2260, lng: 106.8080, altitude: 26, distanceKm: 6.8, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'SCBD Gate / Polda Metro' },
      { lat: -6.2285, lng: 106.8020, altitude: 25, distanceKm: 7.7, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Bundaran Senayan (Patung Pemuda Membangun)' },
      { lat: -6.2185, lng: 106.8015, altitude: 24, distanceKm: 9.1, gradientPercent: -0.1, surface: 'paved_bike_lane', name: 'GBK Senayan Ring Luar (Jalur Khusus Sepeda)' },
      { lat: -6.2100, lng: 106.8050, altitude: 23, distanceKm: 10.4, gradientPercent: -0.1, surface: 'paved_bike_lane', name: 'Jl. Asia Afrika (Sprint Segment)' },
      { lat: -6.2080, lng: 106.8140, altitude: 22, distanceKm: 11.9, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Gatot Subroto Arteri' },
      { lat: -6.2180, lng: 106.8180, altitude: 21, distanceKm: 13.5, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Sudirman Arah Utara (Loop Balik)' },
      { lat: -6.2090, lng: 106.8210, altitude: 19, distanceKm: 14.8, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Sampoerna Strategic Square' },
      { lat: -6.1950, lng: 106.8235, altitude: 16, distanceKm: 16.7, gradientPercent: -0.2, surface: 'smooth_asphalt', name: 'Bundaran HI Arah Utara' },
      { lat: -6.1850, lng: 106.8242, altitude: 15, distanceKm: 18.2, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Thamrin Sarinah Flat Sprint' },
      { lat: -6.1754, lng: 106.8272, altitude: 14, distanceKm: 22.4, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Finish: Monas Pintu Silang Barat' },
    ],
  },
  {
    id: 'curated-pik2-coastal-sprint',
    title: 'PIK 2 Coastal Sprint Circuit',
    subtitle: 'Rute Primadona Time-Trial & Peloton Speed (Jakarta Utara – Tangerang)',
    description: 'Sirkuit jalan raya tepi laut dengan aspal grade tinggi, lajur sepeda 4 meter terdedikasi, hembusan angin pantai untuk latihan power endurance (FTP), serta jembatan PIK iconik.',
    category: 'curated',
    difficulty: 'Mudah (Datar)',
    climbCategory: 'Datar / Flat',
    distanceKm: 34.6,
    elevationGainM: 74,
    elevationLossM: 74,
    maxGradientPercent: 3.2,
    avgGradientPercent: 0.3,
    minAltitudeM: 2,
    maxAltitudeM: 18,
    estimatedTimeMinutes: 65,
    surfaceSuitability: {
      smoothAsphaltPercent: 98,
      bikeLanePercent: 90,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '05:30 – 08:30 WIB (Pagi hari bebas terik & angin seimbang)',
    bounds: {
      north: -6.040,
      south: -6.120,
      east: 106.755,
      west: 106.680,
    },
    points: [
      { lat: -6.1110, lng: 106.7450, altitude: 3, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: Pantjoran PIK 1 (Pintu Masuk Golf Island)' },
      { lat: -6.1040, lng: 106.7380, altitude: 8, distanceKm: 1.2, gradientPercent: 0.4, surface: 'smooth_asphalt', name: 'Jembatan Penghubung Golf Island' },
      { lat: -6.0960, lng: 106.7320, altitude: 14, distanceKm: 2.5, gradientPercent: 0.5, surface: 'smooth_asphalt', name: 'Jembatan Merah PIK 2 (Iconic Climb)' },
      { lat: -6.0850, lng: 106.7260, altitude: 5, distanceKm: 4.2, gradientPercent: -0.5, surface: 'smooth_asphalt', name: 'Boulevard Sudirman PIK 2' },
      { lat: -6.0720, lng: 106.7210, altitude: 4, distanceKm: 6.0, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Kawasan Pasir Putih Beach Road' },
      { lat: -6.0600, lng: 106.7150, altitude: 3, distanceKm: 8.1, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Pantai Pasir Putih PIK 2' },
      { lat: -6.0480, lng: 106.7080, altitude: 3, distanceKm: 10.5, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Tokyo Riverside Sprint Corridor' },
      { lat: -6.0410, lng: 106.7020, altitude: 4, distanceKm: 13.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'U-Turn Ujung Kawasan PIK 2 Utara' },
      { lat: -6.0480, lng: 106.7080, altitude: 3, distanceKm: 15.5, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Balik Arah: Segmen Headwind/Tailwind' },
      { lat: -6.0650, lng: 106.7180, altitude: 4, distanceKm: 19.2, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Boulevard Timur Hijau' },
      { lat: -6.0820, lng: 106.7250, altitude: 5, distanceKm: 23.4, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'CBD PIK 2 Loop' },
      { lat: -6.0960, lng: 106.7320, altitude: 14, distanceKm: 27.8, gradientPercent: 0.4, surface: 'smooth_asphalt', name: 'Jembatan Merah Arah Selatan' },
      { lat: -6.1040, lng: 106.7380, altitude: 8, distanceKm: 31.0, gradientPercent: -0.3, surface: 'smooth_asphalt', name: 'Jembatan Golf Island' },
      { lat: -6.1110, lng: 106.7450, altitude: 3, distanceKm: 34.6, gradientPercent: -0.1, surface: 'smooth_asphalt', name: 'Finish: Pantjoran PIK Loop Point' },
    ],
  },
  {
    id: 'curated-sentul-km0-climb',
    title: 'Sentul City – Rainbow Hills – KM 0 Climb',
    subtitle: 'Tantangan Tanjakan Populer Road Bike (Bogor)',
    description: 'Rute legendaris KOM (King of the Mountain) untuk road bike di Jawa Barat. Menawarkan tanjakan rolling bertingkat dengan gradien mulai 4% hingga dinding terjal 12.8% di segmen Bojong Koneng.',
    category: 'curated',
    difficulty: 'Tantangan (Tanjakan)',
    climbCategory: 'Cat 2',
    distanceKm: 28.2,
    elevationGainM: 685,
    elevationLossM: 685,
    maxGradientPercent: 12.8,
    avgGradientPercent: 4.8,
    minAltitudeM: 180,
    maxAltitudeM: 682,
    estimatedTimeMinutes: 85,
    surfaceSuitability: {
      smoothAsphaltPercent: 92,
      bikeLanePercent: 40,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '06:00 – 09:30 WIB (Pemandangan Gunung Pancar & udara sejuk)',
    bounds: {
      north: -6.550,
      south: -6.640,
      east: 106.920,
      west: 106.840,
    },
    points: [
      { lat: -6.5650, lng: 106.8620, altitude: 185, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: Bellanova Sentul City' },
      { lat: -6.5740, lng: 106.8680, altitude: 215, distanceKm: 1.4, gradientPercent: 2.1, surface: 'smooth_asphalt', name: 'Bundaran Sentul Nirwana' },
      { lat: -6.5820, lng: 106.8780, altitude: 260, distanceKm: 3.1, gradientPercent: 2.6, surface: 'smooth_asphalt', name: 'Taman Budaya Sentul' },
      { lat: -6.5910, lng: 106.8860, altitude: 320, distanceKm: 5.0, gradientPercent: 3.2, surface: 'smooth_asphalt', name: 'Gerbang Rainbow Hills Golf' },
      { lat: -6.5990, lng: 106.8920, altitude: 395, distanceKm: 7.2, gradientPercent: 3.4, surface: 'smooth_asphalt', name: 'Rainbow Hills Rolling Peak' },
      { lat: -6.6080, lng: 106.8970, altitude: 430, distanceKm: 9.3, gradientPercent: 1.7, surface: 'smooth_asphalt', name: 'Simpang Babakan Madang' },
      { lat: -6.6160, lng: 106.9020, altitude: 510, distanceKm: 11.2, gradientPercent: 4.2, surface: 'smooth_asphalt', name: 'Awal Tanjakan Bojong Koneng (Gradien 7%)' },
      { lat: -6.6210, lng: 106.9050, altitude: 590, distanceKm: 12.6, gradientPercent: 5.7, surface: 'smooth_asphalt', name: 'Tanjakan Dinding Cinta (Max 12.8%)' },
      { lat: -6.6260, lng: 106.9090, altitude: 682, distanceKm: 14.1, gradientPercent: 6.5, surface: 'smooth_asphalt', name: 'PUNCAK KM 0 SENTUL (Ketinggian 682m dpl)', isPeak: true },
      { lat: -6.6210, lng: 106.9050, altitude: 590, distanceKm: 15.6, gradientPercent: -5.7, surface: 'smooth_asphalt', name: 'Turunan Teknis Bojong Koneng' },
      { lat: -6.6120, lng: 106.8990, altitude: 470, distanceKm: 17.5, gradientPercent: -6.3, surface: 'smooth_asphalt', name: 'Gunung Geulis Descent' },
      { lat: -6.5950, lng: 106.8890, altitude: 350, distanceKm: 21.0, gradientPercent: -3.4, surface: 'smooth_asphalt', name: 'Rainbow Hills Arteri Bawah' },
      { lat: -6.5800, lng: 106.8750, altitude: 240, distanceKm: 24.8, gradientPercent: -2.9, surface: 'smooth_asphalt', name: 'Sentul Nirwana Kembali' },
      { lat: -6.5650, lng: 106.8620, altitude: 185, distanceKm: 28.2, gradientPercent: -1.6, surface: 'smooth_asphalt', name: 'Finish: Bellanova Mall Loop' },
    ],
  },
  {
    id: 'curated-bsd-circuit-loop',
    title: 'BSD Grand Boulevard Outer Ring',
    subtitle: 'Sirkuit Rolling Hills & Aspal Mulus Lebar (Tangerang Selatan)',
    description: 'Sirkuit favorit komunitas road bike Tangerang dan Jakarta Barat. Jalur lingkar luar dengan kontur rolling halus (ombak tanjakan manis), aspal hotmix 4 lajur, dan minim lampu merah.',
    category: 'curated',
    difficulty: 'Sedang (Rolling)',
    climbCategory: 'Cat 4',
    distanceKm: 30.5,
    elevationGainM: 185,
    elevationLossM: 185,
    maxGradientPercent: 4.8,
    avgGradientPercent: 1.2,
    minAltitudeM: 32,
    maxAltitudeM: 88,
    estimatedTimeMinutes: 58,
    surfaceSuitability: {
      smoothAsphaltPercent: 96,
      bikeLanePercent: 75,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '05:30 – 08:00 WIB',
    bounds: {
      north: -6.270,
      south: -6.340,
      east: 106.680,
      west: 106.610,
    },
    points: [
      { lat: -6.3020, lng: 106.6540, altitude: 45, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: The Breeze BSD City' },
      { lat: -6.2950, lng: 106.6430, altitude: 52, distanceKm: 1.8, gradientPercent: 0.4, surface: 'smooth_asphalt', name: 'QBig BSD Boulevard' },
      { lat: -6.2880, lng: 106.6320, altitude: 65, distanceKm: 3.5, gradientPercent: 0.7, surface: 'smooth_asphalt', name: 'GOP 9 / Green Office Park' },
      { lat: -6.2820, lng: 106.6210, altitude: 78, distanceKm: 5.4, gradientPercent: 0.7, surface: 'smooth_asphalt', name: 'Simpang Vanya Park (Rolling Climb)' },
      { lat: -6.2900, lng: 106.6140, altitude: 88, distanceKm: 7.8, gradientPercent: 0.4, surface: 'smooth_asphalt', name: 'Puncak Rolling West BSD', isPeak: true },
      { lat: -6.3050, lng: 106.6180, altitude: 72, distanceKm: 10.4, gradientPercent: -0.6, surface: 'smooth_asphalt', name: 'ICE BSD Outer Ring' },
      { lat: -6.3150, lng: 106.6260, altitude: 58, distanceKm: 13.0, gradientPercent: -0.5, surface: 'smooth_asphalt', name: 'AEON Mall BSD Straight Sprint' },
      { lat: -6.3260, lng: 106.6380, altitude: 42, distanceKm: 16.2, gradientPercent: -0.5, surface: 'smooth_asphalt', name: 'Boulevard Cisauk Interchange' },
      { lat: -6.3320, lng: 106.6520, altitude: 34, distanceKm: 19.5, gradientPercent: -0.2, surface: 'smooth_asphalt', name: 'Jembatan Cisadane BSD Selatan' },
      { lat: -6.3220, lng: 106.6620, altitude: 48, distanceKm: 22.8, gradientPercent: 0.4, surface: 'smooth_asphalt', name: 'Nava Park Green Corridor' },
      { lat: -6.3100, lng: 106.6600, altitude: 55, distanceKm: 26.2, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Foresta Boulevard Sprint' },
      { lat: -6.3020, lng: 106.6540, altitude: 45, distanceKm: 30.5, gradientPercent: -0.2, surface: 'smooth_asphalt', name: 'Finish: The Breeze Loop Point' },
    ],
  },
  {
    id: 'curated-bintaro-loop',
    title: 'Bintaro Loop (Binloop) Criterium Circuit',
    subtitle: 'Sirkuit Kecepatan Peleton & High-Cadence Training',
    description: 'Sirkuit tertutup dan bersih dengan panjang putaran ~4.6 km per lap. Bebas lubang jalan, aspal super halus, sangat populer untuk latihan rolling peleton berkelompok (drafting) dan threshold test.',
    category: 'curated',
    difficulty: 'Mudah (Datar)',
    climbCategory: 'Datar / Flat',
    distanceKm: 18.4,
    elevationGainM: 42,
    elevationLossM: 42,
    maxGradientPercent: 1.8,
    avgGradientPercent: 0.3,
    minAltitudeM: 28,
    maxAltitudeM: 42,
    estimatedTimeMinutes: 38,
    surfaceSuitability: {
      smoothAsphaltPercent: 99,
      bikeLanePercent: 90,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '05:30 – 07:45 WIB (Waktu berkumpul peleton road bike)',
    bounds: {
      north: -6.275,
      south: -6.305,
      east: 106.725,
      west: 106.695,
    },
    points: [
      { lat: -6.2860, lng: 106.7080, altitude: 32, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: Binloop Main Pit Stop (Bintaro Sektor 7)' },
      { lat: -6.2820, lng: 106.7040, altitude: 35, distanceKm: 1.1, gradientPercent: 0.3, surface: 'smooth_asphalt', name: 'Boulevard Bintaro Jaya Sektor 9' },
      { lat: -6.2880, lng: 106.7010, altitude: 38, distanceKm: 2.3, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Underpass Menteng Bintaro' },
      { lat: -6.2940, lng: 106.7050, altitude: 40, distanceKm: 3.5, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Putaran Boulevard Emerald' },
      { lat: -6.2860, lng: 106.7080, altitude: 32, distanceKm: 4.6, gradientPercent: -0.7, surface: 'smooth_asphalt', name: 'Akhir Lap 1 (Sprint Line)' },
      { lat: -6.2820, lng: 106.7040, altitude: 35, distanceKm: 5.7, gradientPercent: 0.3, surface: 'smooth_asphalt', name: 'Lap 2: Pelotons Acceleration' },
      { lat: -6.2940, lng: 106.7050, altitude: 40, distanceKm: 8.1, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Lap 2: Emerald Turn' },
      { lat: -6.2860, lng: 106.7080, altitude: 32, distanceKm: 9.2, gradientPercent: -0.7, surface: 'smooth_asphalt', name: 'Akhir Lap 2' },
      { lat: -6.2820, lng: 106.7040, altitude: 35, distanceKm: 10.3, gradientPercent: 0.3, surface: 'smooth_asphalt', name: 'Lap 3: High-Cadence Segment' },
      { lat: -6.2860, lng: 106.7080, altitude: 32, distanceKm: 13.8, gradientPercent: -0.7, surface: 'smooth_asphalt', name: 'Akhir Lap 3' },
      { lat: -6.2940, lng: 106.7050, altitude: 40, distanceKm: 17.3, gradientPercent: 0.2, surface: 'smooth_asphalt', name: 'Lap 4: Final Breakaway Turn' },
      { lat: -6.2860, lng: 106.7080, altitude: 32, distanceKm: 18.4, gradientPercent: -0.7, surface: 'smooth_asphalt', name: 'Finish: 4 Laps Total (Sprint Finish)' },
    ],
  },
  {
    id: 'curated-dago-giri-punclut',
    title: 'Dago Giri – Punclut – Lembang Mountain KOM',
    subtitle: 'Rute Raja Tanjakan Road Bike (Bandung Utara)',
    description: 'Surganya pecinta tanjakan ekstrem di Bandung. Aspal beton halus namun memiliki elevasi menanjak terus-menerus hingga ketinggian 1.340 mdpl dengan gradien mencapai 16% di Tanjakan Naga.',
    category: 'curated',
    difficulty: 'Ekstrem (HC Climb)',
    climbCategory: 'HC',
    distanceKm: 24.8,
    elevationGainM: 840,
    elevationLossM: 840,
    maxGradientPercent: 16.4,
    avgGradientPercent: 6.8,
    minAltitudeM: 730,
    maxAltitudeM: 1345,
    estimatedTimeMinutes: 105,
    surfaceSuitability: {
      smoothAsphaltPercent: 90,
      bikeLanePercent: 20,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '06:00 – 08:30 WIB (Pagi hari sebelum kabut tebal)',
    bounds: {
      north: -6.820,
      south: -6.890,
      east: 106.650,
      west: 106.590,
    },
    points: [
      { lat: -6.8850, lng: 106.6150, altitude: 735, distanceKm: 0.0, gradientPercent: 0.0, surface: 'smooth_asphalt', name: 'Start: Simpang Dago / McD Dago' },
      { lat: -6.8720, lng: 106.6190, altitude: 810, distanceKm: 1.8, gradientPercent: 4.2, surface: 'smooth_asphalt', name: 'Dago Atas / Terminal Dago' },
      { lat: -6.8620, lng: 106.6230, altitude: 920, distanceKm: 3.5, gradientPercent: 6.5, surface: 'smooth_asphalt', name: 'Pintu Gerbang Dago Giri' },
      { lat: -6.8530, lng: 106.6210, altitude: 1050, distanceKm: 5.6, gradientPercent: 6.2, surface: 'smooth_asphalt', name: 'Tanjakan Lawangwangi Art' },
      { lat: -6.8440, lng: 106.6170, altitude: 1190, distanceKm: 7.9, gradientPercent: 6.1, surface: 'smooth_asphalt', name: 'Tanjakan Naga Punclut (Max 16.4%)' },
      { lat: -6.8360, lng: 106.6120, altitude: 1345, distanceKm: 10.4, gradientPercent: 6.2, surface: 'smooth_asphalt', name: 'PUNCAK LEMBANG SKYLINE (1.345m dpl)', isPeak: true },
      { lat: -6.8280, lng: 106.6080, altitude: 1290, distanceKm: 12.4, gradientPercent: -2.8, surface: 'smooth_asphalt', name: 'Alun-alun Lembang Balik Arah' },
      { lat: -6.8400, lng: 106.6020, altitude: 1150, distanceKm: 15.6, gradientPercent: -4.4, surface: 'smooth_asphalt', name: 'Turunan Ciumbuleuit Atas' },
      { lat: -6.8600, lng: 106.6050, altitude: 940, distanceKm: 19.5, gradientPercent: -5.4, surface: 'smooth_asphalt', name: 'Punclut Panorama Descent' },
      { lat: -6.8750, lng: 106.6090, altitude: 810, distanceKm: 22.2, gradientPercent: -4.8, surface: 'smooth_asphalt', name: 'Ciumbuleuit UNPAR' },
      { lat: -6.8850, lng: 106.6150, altitude: 735, distanceKm: 24.8, gradientPercent: -2.9, surface: 'smooth_asphalt', name: 'Finish: Simpang Dago Loop' },
    ],
  },
];

// -------------------------------------------------------------
// Smart Road Bike Route Generator
// (Creates road-bike specific loop or out-and-back from any GPS location)
// -------------------------------------------------------------

export interface GenerateRouteParams {
  startLat: number;
  startLng: number;
  targetDistanceKm: number;
  profileType: 'flat' | 'rolling' | 'climbing';
  isLoop: boolean;
  name?: string;
  roadHeadingDeg?: number;
}

export function generateRoadBikeRoute(params: GenerateRouteParams): DigitalRoute {
  const {
    startLat,
    startLng,
    targetDistanceKm,
    profileType,
    isLoop,
    name,
    roadHeadingDeg = 45,
  } = params;

  // Number of digital waypoints for high-resolution elevation profile
  const pointCount = Math.max(16, Math.min(48, Math.round(targetDistanceKm * 1.2)));
  const points: DigitalRoutePoint[] = [];

  // Approximate base altitude (if not available, estimate 18m)
  const baseAltitude = 22;

  // Elevation amplitude based on selected road bike profile
  const elevationScale =
    profileType === 'flat' ? 12 : profileType === 'rolling' ? 65 : 340;

  // Radius in degrees ~ (targetDistanceKm / (2 * PI)) / 111.32 km/deg
  const loopRadiusDeg = isLoop
    ? (targetDistanceKm / (2 * Math.PI)) / 111.32
    : (targetDistanceKm / 2) / 111.32;

  const headingRad = (roadHeadingDeg * Math.PI) / 180;

  let cumulativeDist = 0;
  let totalGain = 0;
  let totalLoss = 0;
  let minAlt = 9999;
  let maxAlt = -9999;
  let maxGradient = 0;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (let i = 0; i <= pointCount; i++) {
    const fraction = i / pointCount;
    let lat: number;
    let lng: number;

    if (isLoop) {
      // Create an elongated smooth road bike loop (aerodynamic tear-drop / oval)
      const angle = fraction * 2 * Math.PI;
      const rx = loopRadiusDeg * 1.35; // elongated along primary corridor
      const ry = loopRadiusDeg * 0.75; // narrower width to mimic boulevard
      // Rotate by heading
      const dx = rx * Math.sin(angle);
      const dy = ry * (1 - Math.cos(angle));

      const rotX = dx * Math.cos(headingRad) - dy * Math.sin(headingRad);
      const rotY = dx * Math.sin(headingRad) + dy * Math.cos(headingRad);

      lat = startLat + rotY;
      lng = startLng + rotX / Math.cos((startLat * Math.PI) / 180);
    } else {
      // Out-and-back route: go forward along heading, then turn back
      const legFraction = fraction <= 0.5 ? fraction * 2 : (1 - fraction) * 2;
      const distDeg = legFraction * loopRadiusDeg;

      // Add slight boulevard gentle curve (road curve simulation)
      const curveOffset = Math.sin(legFraction * Math.PI) * (loopRadiusDeg * 0.12);

      const dx = distDeg * Math.sin(headingRad) + curveOffset * Math.cos(headingRad);
      const dy = distDeg * Math.cos(headingRad) - curveOffset * Math.sin(headingRad);

      lat = startLat + dy;
      lng = startLng + dx / Math.cos((startLat * Math.PI) / 180);
    }

    // Update bounds
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;

    // Calculate realistic digital elevation
    let altitude: number;
    if (profileType === 'flat') {
      // Gentle undulating highway (0% - 1.8% slope)
      const wave = Math.sin(fraction * 3 * Math.PI) * 4 + Math.cos(fraction * 6 * Math.PI) * 2;
      altitude = Math.round(baseAltitude + wave);
    } else if (profileType === 'rolling') {
      // Punchy rolling hills (2% - 5.5% slope waves)
      const wave1 = Math.sin(fraction * 4 * Math.PI) * (elevationScale * 0.5);
      const wave2 = Math.cos(fraction * 8 * Math.PI) * (elevationScale * 0.25);
      altitude = Math.round(baseAltitude + Math.max(0, wave1 + wave2));
    } else {
      // Mountain climb: steady ascent in the middle, peak near summit, then descent
      const ascentFraction = isLoop ? Math.sin(fraction * Math.PI) : (fraction <= 0.5 ? fraction * 2 : (1 - fraction) * 2);
      const mountainCurve = Math.pow(ascentFraction, 1.4) * elevationScale;
      // Add switchback step-like variation
      const switchbacks = Math.sin(fraction * 10 * Math.PI) * 12;
      altitude = Math.round(baseAltitude + mountainCurve + switchbacks);
    }

    if (altitude < minAlt) minAlt = altitude;
    if (altitude > maxAlt) maxAlt = altitude;

    // Calculate segment distance and gradient
    let segmentGrad = 0;
    if (i > 0) {
      const prev = points[i - 1];
      const deltaKm = haversineDistanceKm(prev.lat, prev.lng, lat, lng);
      cumulativeDist += deltaKm;
      const altDelta = altitude - prev.altitude;
      if (altDelta > 0) totalGain += altDelta;
      if (altDelta < 0) totalLoss += Math.abs(altDelta);

      segmentGrad = calculateGradient(altDelta, deltaKm);
      if (Math.abs(segmentGrad) > maxGradient) {
        maxGradient = Math.abs(segmentGrad);
      }
    }

    let pointName: string | undefined;
    if (i === 0) pointName = 'Titik Awal (Start GPS)';
    else if (i === Math.floor(pointCount / 2)) pointName = isLoop ? 'Titik Tengah Loop' : 'Titik Putar Balik (U-Turn)';
    else if (i === pointCount) pointName = isLoop ? 'Selesai Loop (Finish)' : 'Kembali ke Titik Awal (Finish)';

    points.push({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      altitude,
      distanceKm: Number(cumulativeDist.toFixed(2)),
      gradientPercent: segmentGrad,
      surface: 'smooth_asphalt',
      name: pointName,
      isPeak: false,
    });
  }

  // Find and mark the highest peak
  const peakIndex = points.reduce((maxIdx, pt, idx, arr) => (pt.altitude > arr[maxIdx].altitude ? idx : maxIdx), 0);
  if (points[peakIndex] && profileType !== 'flat') {
    points[peakIndex].isPeak = true;
    points[peakIndex].name = `Puncak Elevasi (${points[peakIndex].altitude}m dpl)`;
  }

  // Padding bounds
  const pad = 0.008;
  const bounds = {
    north: north + pad,
    south: south - pad,
    east: east + pad,
    west: west - pad,
  };

  const finalDistance = Math.round(cumulativeDist * 10) / 10;
  const avgGrad = finalDistance > 0 ? Math.round(((totalGain / (finalDistance * 1000)) * 100) * 10) / 10 : 0;
  const climbCat = calculateClimbCategory(totalGain, maxGradient, finalDistance);

  const difficulty =
    profileType === 'climbing'
      ? (totalGain > 700 ? 'Ekstrem (HC Climb)' : 'Tantangan (Tanjakan)')
      : profileType === 'rolling'
      ? 'Sedang (Rolling)'
      : 'Mudah (Datar)';

  const autoTitle = name || `Road Bike ${profileType === 'flat' ? 'Aero Flat' : profileType === 'rolling' ? 'Rolling Hills' : 'KOM Climb'} ${Math.round(finalDistance)} km`;
  const routeId = `gen_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Estimated road bike speed: flat = 28km/h, rolling = 24km/h, climbing = 18km/h
  const avgSpeedEstimate = profileType === 'flat' ? 28 : profileType === 'rolling' ? 24 : 18;
  const estimatedTimeMinutes = Math.round((finalDistance / avgSpeedEstimate) * 60);

  return {
    id: routeId,
    title: autoTitle,
    subtitle: `${isLoop ? 'Sirkuit Loop Melingkar' : 'Jalur Bolak-Balik'} | Aspal Mulus Road Bike`,
    description: `Rute sepeda road bike rekomendasi otomatis berbasis lokasi Anda. Profil elevasi ${profileType.toUpperCase()} dengan total kenaikan +${totalGain}m dan gradien puncak ${maxGradient}%. Dirancang khusus untuk ban ramping (25-30c) dan aspal hotmix mulus.`,
    category: 'generated',
    difficulty,
    climbCategory: climbCat,
    distanceKm: finalDistance,
    elevationGainM: totalGain,
    elevationLossM: totalLoss,
    maxGradientPercent: maxGradient,
    avgGradientPercent: avgGrad,
    minAltitudeM: minAlt,
    maxAltitudeM: maxAlt,
    estimatedTimeMinutes,
    surfaceSuitability: {
      smoothAsphaltPercent: 96,
      bikeLanePercent: 70,
      trafficLevel: 'Rendah (Pagi Hari)',
    },
    recommendedTime: '05:30 – 08:30 WIB (Pagi hari optimal peleton)',
    bounds,
    points,
  };
}

// -------------------------------------------------------------
// Offline Tile Downloader for a Specific Road Bike Route
// -------------------------------------------------------------

export async function downloadRouteOfflineTiles(
  route: DigitalRoute,
  options?: {
    minZoom?: number;
    maxZoom?: number;
    style?: MapStyle;
    onProgress?: (progress: DownloadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<{ tileCount: number; sizeBytes: number }> {
  const minZoom = options?.minZoom ?? 13;
  const maxZoom = options?.maxZoom ?? 15;
  const style = options?.style ?? 'voyager';
  const signal = options?.signal;
  const onProgress = options?.onProgress;

  // Gather unique tile coordinates covering the route bounds
  const tilesToFetch: { x: number; y: number; z: number }[] = [];
  const seenKeys = new Set<string>();

  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = latLngToTile(route.bounds.north, route.bounds.west, z);
    const se = latLngToTile(route.bounds.south, route.bounds.east, z);

    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${z}_${x}_${y}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          tilesToFetch.push({ x, y, z });
        }
      }
    }
  }

  const total = tilesToFetch.length;
  let completed = 0;
  let failed = 0;
  let bytesDownloaded = 0;

  onProgress?.({
    total,
    completed: 0,
    failed: 0,
    currentZoom: minZoom,
    percent: 0,
    bytesDownloaded: 0,
    status: 'downloading',
  });

  const layer = MAP_LAYERS[style];
  const BATCH_SIZE = 6;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new Error('Download dibatalkan oleh pengguna');
    }

    const batch = tilesToFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ x, y, z }) => {
        const key = getTileKey(style, z, x, y);
        const url = layer.url
          .replace('{z}', String(z))
          .replace('{x}', String(x))
          .replace('{y}', String(y));

        try {
          const res = await fetch(url, { signal, cache: 'no-cache' });
          if (res.ok) {
            const blob = await res.blob();
            bytesDownloaded += blob.size;
            await saveTile(key, blob, blob.type || 'image/png');
            completed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      })
    );

    const percent = Math.round(((completed + failed) / total) * 100);
    const activeZoom = batch.length > 0 ? batch[0].z : minZoom;
    onProgress?.({
      total,
      completed,
      failed,
      currentZoom: activeZoom,
      percent,
      bytesDownloaded,
      status: 'downloading',
    });
  }

  // Update route with offline status
  route.isOfflineCached = true;
  route.cachedTileCount = completed;
  route.cachedAt = Date.now();
  await saveOfflineRoute(route);

  onProgress?.({
    total,
    completed,
    failed,
    currentZoom: maxZoom,
    percent: 100,
    bytesDownloaded,
    status: 'completed',
  });

  return { tileCount: completed, sizeBytes: bytesDownloaded };
}

// Get all combined routes (curated + user-saved/generated)
export async function getAllRoadBikeRoutes(): Promise<DigitalRoute[]> {
  try {
    const saved = await getOfflineRoutes();
    const savedMap = new Map<string, DigitalRoute>();
    saved.forEach((r) => savedMap.set(r.id, r));

    // Combine curated with any cached state
    const result: DigitalRoute[] = CURATED_ROAD_BIKE_ROUTES.map((curated) => {
      if (savedMap.has(curated.id)) {
        return savedMap.get(curated.id)!;
      }
      return curated;
    });

    // Append generated / custom routes from user
    saved.forEach((r) => {
      if (!CURATED_ROAD_BIKE_ROUTES.some((c) => c.id === r.id)) {
        result.push(r);
      }
    });

    return result;
  } catch {
    return CURATED_ROAD_BIKE_ROUTES;
  }
}
