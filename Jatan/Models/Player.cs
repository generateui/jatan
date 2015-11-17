﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Configuration;
using System.Text;
using System.Threading.Tasks;
using Jatan.Core;

namespace Jatan.Models
{
    /// <summary>
    /// A class to represent a player.
    /// </summary>
    public class Player
    {
        /// <summary>
        /// The name of the player.
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// The unique Id of the player. The server should manage these.
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// The color of the player pieces.
        /// </summary>
        public uint Color { get; set; }

        /// <summary>
        /// Gets the remaining roads this player has.
        /// </summary>
        public int RoadsAvailable { get; set; }

        /// <summary>
        /// Gets the remaining settlements this player has.
        /// </summary>
        public int SettlementsAvailable { get; set; }

        /// <summary>
        /// Gets the remaining cities this player has.
        /// </summary>
        public int CitiesAvailable { get; set; }

        /// <summary>
        /// Gets the resource cards this player has in their hand.
        /// </summary>
        public List<ResourceTypes> ResourceCards { get; set; }

        /// <summary>
        /// Gets the development cards this player has in their hand.
        /// </summary>
        public List<DevelopmentCards> DevelopmentCards { get; set; }

        /// <summary>
        /// Gets the development cards this player has played.
        /// </summary>
        public List<DevelopmentCards> DevelopmentCardsInPlay { get; set; }

        /// <summary>
        /// Gets the number of resource cards.
        /// </summary>
        public int NumberOfResourceCards { get { return ResourceCards.Count; } }

        /// <summary>
        /// Gets the number of victory points this player has from cards alone.
        /// </summary>
        public int VictoryPointsFromCards
        {
            get
            {
                return DevelopmentCardsInPlay.Count(
                        c => c == Models.DevelopmentCards.Library || c == Models.DevelopmentCards.Palace);
            }
        }

        /// <summary>
        /// Gets the number of knights this player has played.
        /// </summary>
        public int ArmySize
        {
            get { return DevelopmentCardsInPlay.Count(c => c == Models.DevelopmentCards.Knight); }
        }

        /// <summary>
        /// Creates a new player.
        /// </summary>
        public Player(int id, string name, uint color)
        {
            Name = name;
            Id = id;
            Color = color;
            RoadsAvailable = 15;
            SettlementsAvailable = 5;
            CitiesAvailable = 4;
            ResourceCards = new List<ResourceTypes>();
            DevelopmentCards = new List<DevelopmentCards>();
            DevelopmentCardsInPlay = new List<DevelopmentCards>();
        }

        /// <summary>
        /// Gets the number of resource cards this player has for a certain type.
        /// </summary>
        public int GetNumberResourceCount(ResourceTypes resource)
        {
            return ResourceCards.Count(c => c == resource);
        }

        /// <summary>
        /// Returns true if the player has at least n of the indicated resource.
        /// </summary>
        public bool HasAtLeast(ResourceTypes resource, int n)
        {
            return ResourceCards.Count(c => c == resource) >= n;
        }

        /// <summary>
        /// Removes a number of resource cards of a certain type. Returns false if the player doesn't have enough.
        /// </summary>
        public bool RemoveResourceCards(ResourceTypes resource, int count)
        {
            if (!HasAtLeast(resource, count))
                return false;
            for (int i = 0; i < count; i++)
                ResourceCards.Remove(resource);
            return true;
        }

        /// <summary>
        /// Removes all resource cards of a certain type. Returns the number of cards removed.
        /// </summary>
        public int RemoveAllResourceCards(ResourceTypes resource)
        {
            return ResourceCards.RemoveAll(c => c == resource);
        }

        /// <summary>
        /// Returns true if the player can afford a certain item.
        /// </summary>
        /// <param name="item"></param>
        /// <returns></returns>
        public bool CanAfford(PurchasableItems item)
        {
            switch (item)
            {
                case PurchasableItems.Road: 
                    return HasAtLeast(ResourceTypes.Wood, 1) &&
                           HasAtLeast(ResourceTypes.Brick, 1);
                case PurchasableItems.Settlement:
                    return HasAtLeast(ResourceTypes.Wood, 1) &&
                           HasAtLeast(ResourceTypes.Brick, 1) &&
                           HasAtLeast(ResourceTypes.Wheat, 1) &&
                           HasAtLeast(ResourceTypes.Sheep, 1);
                case PurchasableItems.City:
                    return HasAtLeast(ResourceTypes.Wheat, 2) &&
                           HasAtLeast(ResourceTypes.Ore, 3);
                case PurchasableItems.DevelopmentCard:
                    return HasAtLeast(ResourceTypes.Wheat, 1) &&
                           HasAtLeast(ResourceTypes.Sheep, 1) &&
                           HasAtLeast(ResourceTypes.Ore, 1);
            }
            return false;
        }

        /// <summary>
        /// Removes resource from a player so they can purchase the specified item. Returns false if they can't afford it.
        /// </summary>
        public ActionResult Purchase(PurchasableItems item, bool isItemFree = false)
        {
            if (!isItemFree && !CanAfford(item))
                return ActionResult.CreateFailed("Cannot afford this.");

            switch (item)
            {
                case PurchasableItems.Road:
                    if (RoadsAvailable <= 0)
                        return ActionResult.CreateFailed("No more roads available.");
                    if (!isItemFree)
                    {
                        RemoveResourceCards(ResourceTypes.Wood, 1);
                        RemoveResourceCards(ResourceTypes.Brick, 1);
                    }
                    RoadsAvailable--;
                    break;
                case PurchasableItems.Settlement:
                    if (SettlementsAvailable <= 0)
                        return ActionResult.CreateFailed("No more settlements available.");
                    if (!isItemFree)
                    {
                        RemoveResourceCards(ResourceTypes.Wood, 1);
                        RemoveResourceCards(ResourceTypes.Brick, 1);
                        RemoveResourceCards(ResourceTypes.Wheat, 1);
                        RemoveResourceCards(ResourceTypes.Sheep, 1);
                    }
                    SettlementsAvailable--;
                    break;
                case PurchasableItems.City:
                    if (CitiesAvailable <= 0)
                        return ActionResult.CreateFailed("No more cities available.");
                    if (!isItemFree)
                    {
                        RemoveResourceCards(ResourceTypes.Wheat, 2);
                        RemoveResourceCards(ResourceTypes.Ore, 3);
                    }
                    SettlementsAvailable++;
                    CitiesAvailable--;
                    break;
                case PurchasableItems.DevelopmentCard:
                    if (!isItemFree)
                    {
                        RemoveResourceCards(ResourceTypes.Wheat, 1);
                        RemoveResourceCards(ResourceTypes.Sheep, 1);
                        RemoveResourceCards(ResourceTypes.Ore, 1);
                    }
                    break;
            }
            return ActionResult.CreateSuccess();
        }
    }
}
