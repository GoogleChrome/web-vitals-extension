export class Metric {

  constructor({id, name, local, finalized, thresholds}) {
    this.id = id;
    this.name = name;
    this.local = local;
    this.finalized = finalized;
    this.thresholds = thresholds;
    this.digitsOfPrecision = 3;
    // This will be replaced with field data, if available.
    this.distribution = [1/3, 1/3, 1/3];
  }

  formatValue(value) {
    return value;
  }

  getAssessment(value) {
    if (!this.thresholds) {
      console.warn('Unable to assess', this, '(no thresholds)');
      return undefined;
    }

    let assessment = 'needs-improvement';
    if (value < this.thresholds.good) {
      assessment = 'good';
    } else if (value >= this.thresholds.poor) {
      assessment = 'poor';
    }

    return assessment;
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

  toLocaleFixed({value, unit}) {
    return value.toLocaleString(undefined, {
      style: unit && 'unit',
      unit,
      unitDisplay: 'narrow',
      minimumFractionDigits: this.digitsOfPrecision,
      maximumFractionDigits: this.digitsOfPrecision
    });
  }

  getDensity(i, decimalPlaces=0) {
    const density = this.distribution[i];

    return `${(density * 100).toFixed(decimalPlaces)}%`;
  }

  static mapCruxNameToId(cruxName) {
    const nameMap = {
      'largest_contentful_paint': 'lcp',
      'first_input_delay': 'fid',
      'cumulative_layout_shift': 'cls',
      'first_contentful_paint': 'fcp'
    };

    return nameMap[cruxName];
  }

  get MIN_PCT() {
    return 0.02;
  }

}

export class LCP extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 2500,
      poor: 4000
    };

    super({
      id: 'lcp',
      name: 'Largest Contentful Paint',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    value /= 1000;
    return this.toLocaleFixed({
      value,
      unit: 'second'
    });
  }

}

export class FID extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 100,
      poor: 300
    };

    super({
      id: 'fid',
      name: 'First Input Delay',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    if (!this.finalized) {
      return 'Waiting for input…';
    }

    return this.toLocaleFixed({
      value,
      unit: 'millisecond'
    });
  }

  getAssessment(value) {
    if (!this.finalized) {
      return;
    }

    return super.getAssessment(value);
  }

}

export class CLS extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 0.10,
      poor: 0.25
    };

    super({
      id: 'cls',
      name: 'Cumulative Layout Shift',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    return this.toLocaleFixed({value});
  }

}
