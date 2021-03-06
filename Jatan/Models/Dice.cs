﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Jatan.Core;

namespace Jatan.Models
{
    /// <summary>
    /// Class used to simulate 6-sided dice and maintain history.
    /// </summary>
    public class Dice
    {
        private static readonly Random _random = new Random();
        private const int DiceSides = 6;

        private int _diceCount;
        private List<RollResult> _rollLog;

        /// <summary>
        /// Returns a copy of the roll log.
        /// </summary>
        public List<RollResult> RollLog
        {
            get { return new List<RollResult>(_rollLog); }
        }

        /// <summary>
        /// The set of numbers which will not be allowed to roll. Useful for testing.
        /// </summary>
        public HashSet<int> ExcludeSet { get; set; }

        /// <summary>
        /// Creates a dice class with the specified number of dice.
        /// </summary>
        /// <param name="diceCount"></param>
        public Dice(int diceCount)
        {
            this.ExcludeSet = new HashSet<int>();
            _rollLog = new List<RollResult>();
            _diceCount = (diceCount < 1) ? 1 : diceCount;
        }

        /// <summary>
        /// Creates a dice class with 2 dice.
        /// </summary>
        public Dice() : this(2)
        {
        }

        /// <summary>
        /// Rolls the dice and returns the result. Also adds the result to the roll log.
        /// </summary>
        /// <returns></returns>
        public RollResult Roll()
        {
            bool done = false;
            List<int> roll = new List<int>();
            while (!done)
            {
                roll = new List<int>();
                for (int i = 0; i < _diceCount; i++)
                {
                    roll.Add(_random.Next(1, DiceSides + 1));
                }
                done = !ExcludeSet.Contains(roll.Sum());
            }
            var result = new RollResult(roll);
            _rollLog.Add(result);
            return result;
        }

        /// <summary>
        /// Clears the roll log.
        /// </summary>
        public void ClearLog()
        {
            _rollLog.Clear();
        }

        /// <summary>
        /// Returns a dictionary containing the roll counts for each possible roll.
        /// </summary>
        public Dictionary<int, int> GetRollCounts()
        {
            var counts = new Dictionary<int, int>();
            for (int i = _diceCount; i <= _diceCount * DiceSides; i++)
            {
                counts.Add(i, _rollLog.Count(r => r.Total == i));
            }
            return counts;
        }
    }
}
