import { describe, expect, it } from 'vite-plus/test';

import { pluralize, singularize } from '@/utils/generator-code/inflection';

describe('generator-code/inflection', () => {
  describe('singularize', () => {
    it.each([
      ['users', 'user'],
      ['posts', 'post'],
      ['areas', 'area'],
      ['houses', 'house'],
      ['courses', 'course'],
      ['archives', 'archive'],
      ['categories', 'category'],
      ['companies', 'company'],
      ['addresses', 'address'],
      ['classes', 'class'],
      ['boxes', 'box'],
      ['taxes', 'tax'],
      ['branches', 'branch'],
      ['batches', 'batch'],
      ['wishes', 'wish'],
      ['buzzes', 'buzz'],
      ['sizes', 'size'],
    ])('takes %s to %s by the regular patterns', (plural, singular) => {
      expect(singularize(plural)).toBe(singular);
    });

    it.each([
      ['people', 'person'],
      ['children', 'child'],
      ['men', 'man'],
      ['women', 'woman'],
      ['statuses', 'status'],
      ['aliases', 'alias'],
      ['analyses', 'analysis'],
      ['indices', 'index'],
      ['criteria', 'criterion'],
      ['quizzes', 'quiz'],
      ['leaves', 'leaf'],
      ['heroes', 'hero'],
    ])('takes the common irregular %s to %s', (plural, singular) => {
      expect(singularize(plural)).toBe(singular);
    });

    it.each([
      ['movies', 'movie'],
      ['cookies', 'cookie'],
      ['caches', 'cache'],
    ])('takes %s, a plain s on a singular, to %s', (plural, singular) => {
      expect(singularize(plural)).toBe(singular);
    });

    it.each([
      'user',
      'status',
      'address',
      'analysis',
      'alias',
      'canvas',
      'news',
      'series',
      'data',
      'staff',
      'person',
    ])('leaves the singular or uncountable %s as it is', word => {
      expect(singularize(word)).toBe(word);
    });

    it.each([
      ['OrderLines', 'OrderLine'],
      ['orderLines', 'orderLine'],
      ['order_lines', 'order_line'],
      ['Users', 'User'],
      ['AuthPeople', 'AuthPerson'],
    ])('takes only the last word of %s, keeping its case', (name, result) => {
      expect(singularize(name)).toBe(result);
    });

    it.each(['USERS', 'users2', '', '_'])(
      'leaves %j, which ends in no lower-case word, as it is',
      name => {
        expect(singularize(name)).toBe(name);
      }
    );
  });

  describe('pluralize', () => {
    it.each([
      ['user', 'users'],
      ['category', 'categories'],
      ['day', 'days'],
      ['key', 'keys'],
      ['address', 'addresses'],
      ['box', 'boxes'],
      ['branch', 'branches'],
      ['wish', 'wishes'],
      ['status', 'statuses'],
      ['alias', 'aliases'],
      ['person', 'people'],
      ['child', 'children'],
      ['leaf', 'leaves'],
      ['hero', 'heroes'],
      ['news', 'news'],
      ['data', 'data'],
    ])('takes %s to %s', (singular, plural) => {
      expect(pluralize(singular)).toBe(plural);
    });

    it('takes only the last word, keeping its case', () => {
      expect(pluralize('OrderLine')).toBe('OrderLines');
      expect(pluralize('companyPerson')).toBe('companyPeople');
    });

    it.each([
      'users',
      'categories',
      'addresses',
      'statuses',
      'people',
      'leaves',
      'heroes',
      'orderLines',
      'movies',
    ])('gives %s back from its own singular', plural => {
      expect(pluralize(singularize(plural))).toBe(plural);
    });
  });
});
