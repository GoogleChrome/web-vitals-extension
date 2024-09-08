import {CLSThresholds, FCPThresholds, INPThresholds, LCPThresholds, TTFBThresholds} from './web-vitals.js';

const assessments = {
  'good': 0,
  'needs-improvement': 1,
  'poor': 2
};

const secondsFormatter = new Intl.NumberFormat(undefined, {
  unit: "second",
  style: 'unit',
  unitDisplay: "short",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3
});

const millisecondsFormatter = new Intl.NumberFormat(undefined, {
  unit: "millisecond",
  style: 'unit',
  unitDisplay: 'short',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const clsFormatter = new Intl.NumberFormat(undefined, {
  unitDisplay: 'short',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});


export class Metric {

  constructor({id, name, local, background, thresholds, rating}) {
    this.id = id;
    this.abbr = id.toUpperCase();
    this.name = name;
    this.local = local;
    this.background = background;
    this.thresholds = thresholds;
    // This will be replaced with field data, if available.
    this.distribution = [1/3, 1/3, 1/3];
    this.rating = rating;
  }

  formatValue(value) {
    return value;
  }

  getAssessmentIndex() {
    return assessments[this.rating];
  }

  getRelativePosition(value) {
    if (!this.thresholds) {
      console.warn('Unable to position local value', this, '(no thresholds)');
      return '0%';
    }

    let relativePosition = 0;
    const {good, poor} = this.thresholds;
    // Densities smaller than this amount are visually insignificant.
    const MIN_PCT = this.MIN_PCT;
    // The poor bucket is unbounded, so a value can never really be 100%.
    const MAX_PCT = 0.95;
    // ... but we still need to use something as the upper limit.
    const MAX_VALUE = poor * 2.5;
    //
    let totalDensity = 0;
    const [pctGood, pctNeedsImprovement, pctPoor] = this.distribution.map(density => {
      // Rating widths aren't affected by MAX_PCT, so we don't adjust for it here.
      density = Math.max(density, MIN_PCT);
      totalDensity += density;
      return density;
    }).map(density => density / totalDensity);

    // The relative position is linearly interpolated for simplicity.
    if (value < good) {
      relativePosition = value * pctGood / good;
    } else if (value >= poor) {
      relativePosition = Math.min(MAX_PCT, (value - poor) / (poor * MAX_VALUE)) * pctPoor + pctGood + pctNeedsImprovement;
    } else {
      relativePosition = (value - good) * pctNeedsImprovement / (poor - good) + pctGood;
    }

    return `${relativePosition * 100}%`;
  }

  getInfo() {
    return;
  }

  getDensity(i, decimalPlaces=0) {
    const density = this.distribution[i];

    return `${(density * 100).toFixed(decimalPlaces)}%`;
  }

  get MIN_PCT() {
    return 0.02;
  }

  set distribution(distribution) {
    const [good, needsImprovement, poor] = distribution;
    let total = good + needsImprovement + poor;
    if (Math.abs(1 - total) > 0.0001) {
      console.warn('Field distribution densities don\'t sum to 100%:', good, needsImprovement, poor);
    }

    // Normalize the densities so they always sum to exactly 100%.
    // Consider [98.29%, 1.39%, 0.31%]. Naive rounding would produce [98%, 1%, 0%].
    // Since 1.39% lost the most due to rounding (0.39%), we overcompensate by making it 2%.
    // This way, the result adds up to 100%: [98%, 2%, 0%].

    // Sort the indices by those that "have the most to lose" by rounding.
    let sortedIndices = distribution.map(i => i - (Math.floor(i * 100) / 100));
    sortedIndices = Array.from(sortedIndices).sort().reverse().map(i => sortedIndices.indexOf(i));
    // Round all densities down to the hundredths place.
    // This is expected to change the total to < 1 (underflow).
    distribution = distribution.map(density => {
      return Math.floor(density * 100 / total) / 100;
    });
    // Add 1% back to the densities that "lost the most" until we reach 100%.
    total = distribution.reduce((total, i) => total + (i * 100), 0);
    for (let i = 0; i < (100 - total); i++) {
      const densityIndex = sortedIndices[i];
      distribution[densityIndex] = ((distribution[densityIndex] * 100) + 1) / 100;
    }

    this._distribution = distribution;
  }

  get distribution() {
    return this._distribution;
  }

  static mapCruxNameToId(cruxName) {
    const nameMap = {
      'largest_contentful_paint': 'lcp',
      'interaction_to_next_paint': 'inp',
      'cumulative_layout_shift': 'cls',
      'first_contentful_paint': 'fcp',
      'experimental_time_to_first_byte': 'ttfb'
    };

    return nameMap[cruxName];
  }

}

export class LCP extends Metric {

  constructor({local, background, rating}) {
    const thresholds = {
      good: LCPThresholds[0],
      poor: LCPThresholds[1]
    };

    // TODO(rviscomi): Consider better defaults.
    local = local || 0;
    rating = rating || 'good';

    super({
      id: 'lcp',
      name: 'Largest Contentful Paint',
      local,
      background,
      thresholds,
      rating
    });
  }

  formatValue(value) {
    value /= 1000;
    return secondsFormatter.format(value);
  }

  getInfo() {
    if (this.background) {
      return 'LCP inflated by tab loading in the background';
    }

    return super.getInfo();
  }

}

export class INP extends Metric {

  constructor({local, background, rating}) {
    const thresholds = {
      good: INPThresholds[0],
      poor: INPThresholds[1]
    };

    super({
      id: 'inp',
      name: 'Interaction to Next Paint',
      local,
      background,
      thresholds,
      rating
    });
  }

  formatValue(value) {
    if (value === null) {
      return 'Waiting for input…';
    }

    return millisecondsFormatter.format(value);
  }

}

export class CLS extends Metric {

  constructor({local, background, rating}) {
    const thresholds = {
      good: CLSThresholds[0],
      poor: CLSThresholds[1]
    };

    // TODO(rviscomi): Consider better defaults.
    local = local || 0;
    rating = rating || 'good';

    super({
      id: 'cls',
      name: 'Cumulative Layout Shift',
      local,
      background,
      thresholds,
      rating
    });
  }

  formatValue(value) {
    return clsFormatter.format(value);
  }

}

export class FCP extends Metric {

  constructor({local, background, rating}) {
    const thresholds = {
      good: FCPThresholds[0],
      poor: FCPThresholds[1]
    };

    // TODO(rviscomi): Consider better defaults.
    local = local || 0;
    rating = rating || 'good';

    super({
      id: 'fcp',
      name: 'First Contentful Paint',
      local,
      background,
      thresholds,
      rating
    });
  }

  formatValue(value) {
    value /= 1000;
    return secondsFormatter.format(value);
  }

  getInfo() {
    if (this.background) {
      return 'FCP inflated by tab loading in the background';
    }

    return super.getInfo();
  }

}

export class TTFB extends Metric {

  constructor({local, background, rating}) {
    const thresholds = {
      good: TTFBThresholds[0],
      poor: TTFBThresholds[1]
    };

    // TODO(rviscomi): Consider better defaults.
    local = local || 0;
    rating = rating || 'good';

    super({
      id: 'ttfb',
      name: 'Time to First Byte',
      local,
      background,
      thresholds,
      rating
    });
  }

  formatValue(value) {
    value /= 1000;
    return secondsFormatter.format(value);
  }

}
