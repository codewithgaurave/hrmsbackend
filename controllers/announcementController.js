import Announcement from "../models/Announcement.js";
import Employee from "../models/Employee.js";

export const createAnnouncement = async (req, res) => {
    console.log(req.body)
    try {
        const { title, message, audience, category, isActive = true } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: "Title and message are required"
            });
        }

        if (audience && !audience.allEmployees &&
            (!audience.departments || audience.departments.length === 0) &&
            (!audience.designations || audience.designations.length === 0) &&
            (!audience.roles || audience.roles.length === 0)) {
            return res.status(400).json({
                success: false,
                message: "Specify at least one audience criteria"
            });
        }

        const announcement = await Announcement.create({
            title,
            message,
            audience: audience || { allEmployees: true },
            category,
            isActive,
            createdBy: req.employee._id
        });

        const populatedAnnouncement = await Announcement.findById(announcement._id)
            .populate("createdBy", "name.first name.last employeeId designation")
            .populate("audience.departments", "name")
            .populate("audience.designations", "name");

        res.status(201).json({
            success: true,
            message: "Announcement created successfully",
            announcement: populatedAnnouncement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const getAllAnnouncements = async (req, res) => {
  try {
    const {
      category,
      isActive,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // 🔍 Category filter (keep if user sends a valid category)
    if (category) {
      filter.category = category;
    }

    // ✅ Active status filter
    if (isActive !== undefined && isActive !== "") {
      filter.isActive = isActive === "true";
    }

    // 🔍 Search filter for title, message, category (case-insensitive)
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { title: regex },
        { message: regex },
        { category: regex },
      ];
    }

    // 🧭 Sorting setup
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // 📄 Pagination setup
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // 🗃️ Fetch announcements
    const announcements = await Announcement.find(filter)
      .populate("createdBy", "name.first name.last employeeId designation department")
      .populate("updatedBy", "name.first name.last employeeId designation")
      .populate("audience.departments", "name")
      .populate("audience.designations", "name")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // 📊 Metadata
    const totalCount = await Announcement.countDocuments(filter);
    const categories = await Announcement.distinct("category");
    const totalPages = Math.ceil(totalCount / limitNum);

    // ✅ Response
    res.status(200).json({
      success: true,
      message: "Announcements fetched successfully",
      total: totalCount,
      announcements,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum,
      },
      filters: {
        categories: categories.filter(Boolean),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getMyAnnouncements = async (req, res) => {
  try {
    const {
      category,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    const currentEmployee = req.employee;

    // 🧩 Base filter (only active announcements)
    const baseFilter = { isActive: true };

    // ✅ Filter by category (removed "All" check)
    if (category) {
      baseFilter.category = category;
    }

    // 🔍 Search filter (title, message, category)
    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");
      baseFilter.$or = [
        { title: regex },
        { message: regex },
        { category: regex },
      ];
    }

    // 🧭 Sorting
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // 🗃️ Fetch all announcements first
    const allAnnouncements = await Announcement.find(baseFilter)
      .populate("createdBy", "name.first name.last employeeId designation department")
      .populate("audience.departments", "name")
      .populate("audience.designations", "name")
      .sort(sortConfig)
      .lean();

    // 🧠 Filter announcements based on audience (visibility)
    const filteredAnnouncements = allAnnouncements.filter((announcement) => {
      const { audience } = announcement;

      if (audience.allEmployees) return true;

      // Department match
      if (audience.departments?.length > 0) {
        const departmentIds = audience.departments.map((d) => d._id.toString());
        if (
          currentEmployee.department &&
          departmentIds.includes(currentEmployee.department.toString())
        ) {
          return true;
        }
      }

      // Designation match
      if (audience.designations?.length > 0) {
        const designationIds = audience.designations.map((d) => d._id.toString());
        if (
          currentEmployee.designation &&
          designationIds.includes(currentEmployee.designation.toString())
        ) {
          return true;
        }
      }

      // Role match
      if (audience.roles?.length > 0) {
        if (audience.roles.includes(currentEmployee.role)) return true;
      }

      return false;
    });

    // 📄 Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, endIndex);

    // 📊 Extract distinct categories for filters
    const categories = [
      ...new Set(filteredAnnouncements.map((a) => a.category).filter(Boolean)),
    ];

    // ✅ Response
    res.status(200).json({
      success: true,
      message: "Announcements fetched successfully",
      total: filteredAnnouncements.length,
      announcements: paginatedAnnouncements,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(filteredAnnouncements.length / limitNum),
        totalCount: filteredAnnouncements.length,
        hasNext: endIndex < filteredAnnouncements.length,
        hasPrev: pageNum > 1,
        limit: limitNum,
      },
      filters: { categories },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


// export const getAllAnnouncements = async (req, res) => {
//     try {
//         const { category, isActive, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;
        
//         let filter = {};

//         if (category && category !== "All") {
//             filter.category = category;
//         }
//      // Active status filter - only apply if isActive is explicitly provided
//         if (isActive !== undefined && isActive !== "") {
//             filter.isActive = isActive === "true";
//         }

//         const sortConfig = {};
//         sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

//         const pageNum = parseInt(page);
//         const limitNum = parseInt(limit);
//         const skip = (pageNum - 1) * limitNum;

//         const announcements = await Announcement.find(filter)
//             .populate("createdBy", "name.first name.last employeeId designation department")
//             .populate("updatedBy", "name.first name.last employeeId designation")
//             .populate("audience.departments", "name")
//             .populate("audience.designations", "name")
//             .sort(sortConfig)
//             .skip(skip)
//             .limit(limitNum)
//             .lean();

//         const totalCount = await Announcement.countDocuments(filter);
//         const categories = await Announcement.distinct("category", filter);
//         const totalPages = Math.ceil(totalCount / limitNum);

//         res.status(200).json({
//             success: true,
//             message: "Announcements fetched successfully",
//             total: totalCount,
//             announcements,
//             pagination: {
//                 currentPage: pageNum,
//                 totalPages,
//                 totalCount,
//                 hasNext: pageNum < totalPages,
//                 hasPrev: pageNum > 1,
//                 limit: limitNum
//             },
//             filters: {
//                 categories: categories.filter(cat => cat)
//             }
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Server error",
//             error: error.message
//         });
//     }
// };

// export const getMyAnnouncements = async (req, res) => {
//     try {
//         const { category, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;
//         const currentEmployee = req.employee;

//         const baseFilter = { isActive: true };

//         if (category && category !== "All") {
//             baseFilter.category = category;
//         }

//         const allAnnouncements = await Announcement.find(baseFilter)
//             .populate("createdBy", "name.first name.last employeeId designation department")
//             .populate("audience.departments", "name")
//             .populate("audience.designations", "name")
//             .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
//             .lean();

//         const filteredAnnouncements = allAnnouncements.filter(announcement => {
//             const { audience } = announcement;

//             if (audience.allEmployees) return true;

//             if (audience.departments?.length > 0) {
//                 const departmentIds = audience.departments.map(dept => dept._id.toString());
//                 if (currentEmployee.department && departmentIds.includes(currentEmployee.department.toString())) {
//                     return true;
//                 }
//             }

//             if (audience.designations?.length > 0) {
//                 const designationIds = audience.designations.map(desig => desig._id.toString());
//                 if (currentEmployee.designation && designationIds.includes(currentEmployee.designation.toString())) {
//                     return true;
//                 }
//             }

//             if (audience.roles?.length > 0) {
//                 if (audience.roles.includes(currentEmployee.role)) return true;
//             }

//             return false;
//         });

//         const pageNum = parseInt(page);
//         const limitNum = parseInt(limit);
//         const startIndex = (pageNum - 1) * limitNum;
//         const endIndex = startIndex + limitNum;

//         const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, endIndex);
//         const categories = [...new Set(filteredAnnouncements.map(ann => ann.category).filter(cat => cat))];

//         res.status(200).json({
//             success: true,
//             message: "Announcements fetched successfully",
//             total: filteredAnnouncements.length,
//             announcements: paginatedAnnouncements,
//             pagination: {
//                 currentPage: pageNum,
//                 totalPages: Math.ceil(filteredAnnouncements.length / limitNum),
//                 totalCount: filteredAnnouncements.length,
//                 hasNext: endIndex < filteredAnnouncements.length,
//                 hasPrev: pageNum > 1,
//                 limit: limitNum
//             },
//             filters: { categories }
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Server error",
//             error: error.message
//         });
//     }
// };

export const getAnnouncementById = async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id)
            .populate("createdBy", "name.first name.last employeeId designation department")
            .populate("updatedBy", "name.first name.last employeeId designation")
            .populate("audience.departments", "name")
            .populate("audience.designations", "name");

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: "Announcement not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Announcement fetched successfully",
            announcement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const updateAnnouncement = async (req, res) => {
    try {
        const { title, message, audience, category, isActive } = req.body;

        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: "Announcement not found"
            });
        }

        if (audience && !audience.allEmployees &&
            (!audience.departments || audience.departments.length === 0) &&
            (!audience.designations || audience.designations.length === 0) &&
            (!audience.roles || audience.roles.length === 0)) {
            return res.status(400).json({
                success: false,
                message: "Specify at least one audience criteria"
            });
        }

        if (title !== undefined) announcement.title = title;
        if (message !== undefined) announcement.message = message;
        if (audience !== undefined) announcement.audience = audience;
        if (category !== undefined) announcement.category = category;
        if (isActive !== undefined) announcement.isActive = isActive;

        announcement.updatedBy = req.employee._id;

        await announcement.save();

        const updatedAnnouncement = await Announcement.findById(announcement._id)
            .populate("createdBy", "name.first name.last employeeId designation department")
            .populate("updatedBy", "name.first name.last employeeId designation")
            .populate("audience.departments", "name")
            .populate("audience.designations", "name");

        res.status(200).json({
            success: true,
            message: "Announcement updated successfully",
            announcement: updatedAnnouncement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const deleteAnnouncement = async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: "Announcement not found"
            });
        }

        await Announcement.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Announcement deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const toggleAnnouncementStatus = async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: "Announcement not found"
            });
        }

        announcement.isActive = !announcement.isActive;
        announcement.updatedBy = req.employee._id;

        await announcement.save();

        const updatedAnnouncement = await Announcement.findById(announcement._id)
            .populate("createdBy", "name.first name.last employeeId designation department")
            .populate("updatedBy", "name.first name.last employeeId designation");

        res.status(200).json({
            success: true,
            message: `Announcement ${announcement.isActive ? 'activated' : 'deactivated'} successfully`,
            announcement: updatedAnnouncement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const getAnnouncementStats = async (req, res) => {
    try {
        const totalAnnouncements = await Announcement.countDocuments();
        const activeAnnouncements = await Announcement.countDocuments({ isActive: true });
        const inactiveAnnouncements = await Announcement.countDocuments({ isActive: false });

        const categories = await Announcement.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $project: { category: "$_id", count: 1, _id: 0 } }
        ]);

        res.status(200).json({
            success: true,
            message: "Announcement statistics fetched successfully",
            stats: {
                total: totalAnnouncements,
                active: activeAnnouncements,
                inactive: inactiveAnnouncements,
                categories
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};