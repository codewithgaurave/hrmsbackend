import Event from "../models/Event.js";
import Employee from "../models/Employee.js";

export const createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      startDate,
      endDate,
      officeLocation,
      isAllDay,
      colorCode,
    } = req.body;

    if (!title || !startDate || !endDate || !officeLocation) {
      return res.status(400).json({
        success: false,
        message: "Title, start date, end date, and office location are required"
      });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date"
      });
    }

    const event = new Event({
      title,
      description,
      eventType,
      startDate,
      endDate,
      officeLocation,
      isAllDay,
      colorCode,
      addedBy: req.employee.id
    });

    const savedEvent = await event.save();
    
    await savedEvent.populate([
      { path: 'officeLocation', select: 'officeName officeAddress' },
      { path: 'addedBy', select: 'employeeId name email createdAt' },
    ]);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: savedEvent
    });

  } catch (error) {
    console.error("Create event error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating event",
      error: error.message
    });
  }
};

export const getMyEvents = async (req, res) => {
  try {
    const { startDate, endDate, eventType } = req.query;
    let filter = { officeLocation: req.employee.officeLocation };

    if (startDate && endDate) {
      filter.$and = [
        { startDate: { $lte: new Date(endDate) } },
        { endDate: { $gte: new Date(startDate) } }
      ];
    }

    if (eventType && eventType !== 'All') {
      filter.eventType = eventType;
    }

    const events = await Event.find(filter)
      .populate('officeLocation', 'officeName officeAddress')
      .populate('addedBy', 'emplyeeId name email createdAt')
      .sort({ startDate: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });

  } catch (error) {
    console.error("Get my events error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching events",
      error: error.message
    });
  }
};

export const getAllEvents = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      eventType,
      officeLocation,
      page = 1,
      limit = 10
    } = req.query;

    let filter = {};

    if (startDate && endDate) {
      filter.$and = [
        { startDate: { $lte: new Date(endDate) } },
        { endDate: { $gte: new Date(startDate) } }
      ];
    }

    if (eventType && eventType !== 'All') {
      filter.eventType = eventType;
    }

    if (officeLocation) {
      filter.officeLocation = officeLocation;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const events = await Event.find(filter)
      .populate('officeLocation', 'officeName officeAddress')
      .populate('addedBy', 'emplyeeId name email createdAt')
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Event.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: events
    });

  } catch (error) {
    console.error("Get all events error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching all events",
      error: error.message
    });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (event.addedBy.toString() !== req.employee.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update events created by you."
      });
    }

    if (req.body.startDate && req.body.endDate) {
      if (new Date(req.body.startDate) >= new Date(req.body.endDate)) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date"
        });
      }
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate([
      { path: 'officeLocation', select: 'officeName officeAddress' },
      { path: 'addedBy', select: 'employeeId name email createdAt' },
    ]);

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: updatedEvent
    });

  } catch (error) {
    console.error("Update event error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating event",
      error: error.message
    });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (event.addedBy.toString() !== req.employee.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete events created by you."
      });
    }

    await Event.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully"
    });

  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting event",
      error: error.message
    });
  }
};

export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('officeLocation', 'officeName officeAddress')
      .populate('addedBy', 'emplyeeId name email createdAt')

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    if (req.employee.role !== "HR_Manager" && 
        event.officeLocation._id.toString() !== req.employee.officeLocation.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view events from your office location."
      });
    }

    res.status(200).json({
      success: true,
      data: event
    });

  } catch (error) {
    console.error("Get event by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching event",
      error: error.message
    });
  }
};