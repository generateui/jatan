﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Jatan.Models;

namespace Jatan.GameLogic
{
    /// <summary>
    /// Class to hold the settings for a game.
    /// </summary>
    public class GameSettings
    {
        /// <summary>
        /// The score a player must reach to win the game.
        /// </summary>
        public int ScoreNeededToWin { get; set; }

        /// <summary>
        /// The robber mode.
        /// </summary>
        public RobberMode RobberMode { get; set; }

        /// <summary>
        /// The number of cards a player must have in order for the
        /// player to lose half their cards when a seven is rolled.
        /// </summary>
        public int CardCountLossThreshold { get; set; }

        /// <summary>
        /// The length of a road a player must have before they can be considered for "longest road".
        /// </summary>
        public int MinimumLongestRoad { get; set; }

        /// <summary>
        /// If non-zero, the number of seconds a player will have to take their turn.
        /// If the timer expires, the current player's turn is skipped.
        /// </summary>
        public int TurnTimeLimit { get; set; }

        /// <summary>
        /// Constructor. Settings set to default.
        /// </summary>
        public GameSettings()
        {
            this.ScoreNeededToWin = 10;
            this.RobberMode = RobberMode.Normal;
            this.CardCountLossThreshold = 8;
            this.MinimumLongestRoad = 5;
            this.TurnTimeLimit = 0;
        }
    }
}
